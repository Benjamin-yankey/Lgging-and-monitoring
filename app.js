const express = require("express");
const client = require("prom-client");
const app = express();

const deploymentTime = new Date().toISOString();
const version = process.env.APP_VERSION || "1.0.0";

// ─── Prometheus Setup ────────────────────────────────────────────────────────
const register = new client.Registry();

// Adds: process_cpu_seconds_total, process_resident_memory_bytes,
//       nodejs_eventloop_lag_seconds, nodejs_active_handles,
//       nodejs_active_requests, nodejs_heap_size_*, nodejs_gc_duration_seconds
client.collectDefaultMetrics({
  register,
  labels: { app: "todo-app", version },
});

// ─── Existing Metrics ────────────────────────────────────────────────────────
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  // More granular buckets for a fast app (ms range)
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: "http_errors_total",
  help: "Total number of HTTP errors",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestCpuTime = new client.Counter({
  name: "http_request_cpu_seconds_total",
  help: "CPU time consumed by HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// ─── NEW: Todo List Business Metrics ────────────────────────────────────────

// Tracks total todos created
const todoCreatedTotal = new client.Counter({
  name: "todo_created_total",
  help: "Total number of todo items created",
  labelNames: ["priority"],
  registers: [register],
});

// Tracks total todos completed
const todoCompletedTotal = new client.Counter({
  name: "todo_completed_total",
  help: "Total number of todo items completed",
  labelNames: ["priority"],
  registers: [register],
});

// Tracks total todos deleted
const todoDeletedTotal = new client.Counter({
  name: "todo_deleted_total",
  help: "Total number of todo items deleted",
  labelNames: [],
  registers: [register],
});

// Gauge: current number of todos in memory (snapshot at any moment)
const todoCountActive = new client.Gauge({
  name: "todo_active_current",
  help: "Current number of active (incomplete) todo items",
  registers: [register],
});

const todoCountCompleted = new client.Gauge({
  name: "todo_completed_current",
  help: "Current number of completed todo items",
  registers: [register],
});

// Histogram: distribution of todos per category
const todoCountByCategory = new client.Gauge({
  name: "todo_count_by_category",
  help: "Number of todos grouped by category",
  labelNames: ["category"],
  registers: [register],
});

// ─── NEW: Request Size Metrics ───────────────────────────────────────────────

const httpRequestSizeBytes = new client.Histogram({
  name: "http_request_size_bytes",
  help: "Size of HTTP request bodies in bytes",
  labelNames: ["method", "route"],
  buckets: [100, 500, 1000, 5000, 10000],
  registers: [register],
});

const httpResponseSizeBytes = new client.Histogram({
  name: "http_response_size_bytes",
  help: "Size of HTTP response bodies in bytes",
  labelNames: ["method", "route", "status_code"],
  buckets: [100, 500, 1000, 5000, 10000, 50000],
  registers: [register],
});

// ─── NEW: Concurrent Requests Gauge ─────────────────────────────────────────

const httpRequestsInFlight = new client.Gauge({
  name: "http_requests_in_flight",
  help: "Number of HTTP requests currently being processed",
  labelNames: ["method", "route"],
  registers: [register],
});

// ─── In-memory storage ───────────────────────────────────────────────────────
const todos = [];
let requestCount = 0;

app.use(express.json());
app.use(express.static("public"));

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  requestCount++;
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${req.method} ${req.path} - Request #${requestCount}`,
  );

  const start = Date.now();
  const cpuStart = process.cpuUsage();

  // Track request body size
  const requestSize = parseInt(req.headers["content-length"] || "0", 10);

  // Increment in-flight gauge
  const routeKey = req.path;
  httpRequestsInFlight.labels(req.method, routeKey).inc();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const cpuEnd = process.cpuUsage(cpuStart);
    const cpuTime = (cpuEnd.user + cpuEnd.system) / 1000000;
    const route = req.route ? req.route.path : req.path;

    // Decrement in-flight
    httpRequestsInFlight.labels(req.method, routeKey).dec();

    // Core metrics
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    httpRequestTotal.labels(req.method, route, res.statusCode).inc();
    httpRequestCpuTime.labels(req.method, route, res.statusCode).inc(cpuTime);

    // Error tracking
    if (res.statusCode >= 400) {
      httpErrorsTotal.labels(req.method, route, res.statusCode).inc();
    }

    // Request/response size tracking
    if (requestSize > 0) {
      httpRequestSizeBytes.labels(req.method, route).observe(requestSize);
    }
    const responseSize = parseInt(res.getHeader("content-length") || "0", 10);
    if (responseSize > 0) {
      httpResponseSizeBytes
        .labels(req.method, route, res.statusCode)
        .observe(responseSize);
    }
  });

  next();
});

// Helper to update todo metrics
function updateTodoMetrics() {
  const activeTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  todoCountActive.set(activeTodos.length);
  todoCountCompleted.set(completedTodos.length);

  // Update category counts
  const categories = ["work", "personal", "shopping", "health", "other"];
  categories.forEach((cat) => {
    const count = todos.filter(
      (t) => t.category === cat && !t.completed,
    ).length;
    todoCountByCategory.labels(cat).set(count);
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  console.log("[INFO] Home page accessed");
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Todo List App - CI/CD Demo</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        h1 { color: #11998e; margin-top: 0; }
        .status { color: #28a745; font-weight: bold; font-size: 18px; }
        .info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #11998e; }
        .form-group { margin: 15px 0; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
        input, select { width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px; }
        button { background: #11998e; color: white; padding: 12px 30px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; }
        button:hover { background: #0d7a6f; }
        .todo-list { margin-top: 30px; }
        .todo-item { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #11998e; display: flex; align-items: center; justify-content: space-between; }
        .todo-item.completed { border-left-color: #6c757d; opacity: 0.7; }
        .todo-item.completed .todo-text { text-decoration: line-through; }
        .todo-checkbox { width: 20px; height: 20px; margin-right: 15px; cursor: pointer; }
        .todo-text { flex-grow: 1; }
        .todo-priority { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 10px; }
        .priority-high { background: #dc3545; color: white; }
        .priority-medium { background: #ffc107; color: black; }
        .priority-low { background: #28a745; color: white; }
        .delete-btn { background: #dc3545; padding: 8px 15px; font-size: 14px; }
        .delete-btn:hover { background: #c82333; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .stat-card { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 32px; font-weight: bold; }
        .stat-label { font-size: 14px; opacity: 0.9; }
        .tabs { display: flex; margin-bottom: 20px; border-bottom: 2px solid #e0e0e0; }
        .tab { padding: 10px 20px; cursor: pointer; border: none; background: none; font-size: 16px; color: #666; }
        .tab.active { color: #11998e; border-bottom: 2px solid #11998e; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>✓ Todo List</h1>
        <p class="status">✓ System Online</p>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value" id="activeTodos">0</div>
                <div class="stat-label">Active</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="completedTodos">0</div>
                <div class="stat-label">Completed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${requestCount}</div>
                <div class="stat-label">API Requests</div>
            </div>
        </div>

        <div class="info">
            <p><strong>Version:</strong> ${version}</p>
            <p><strong>Deployed:</strong> ${deploymentTime}</p>
            <p><strong>Server Time:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <h2>Add New Todo</h2>
        <form id="todoForm">
            <div class="form-group">
                <label>Task</label>
                <input type="text" id="task" placeholder="What needs to be done?" required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select id="category" required>
                    <option value="">Select Category</option>
                    <option value="work">Work</option>
                    <option value="personal">Personal</option>
                    <option value="shopping">Shopping</option>
                    <option value="health">Health</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Priority</label>
                <select id="priority" required>
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                </select>
            </div>
            <button type="submit">Add Todo</button>
        </form>

        <div class="tabs">
            <button class="tab active" onclick="filterTodos('all')">All</button>
            <button class="tab" onclick="filterTodos('active')">Active</button>
            <button class="tab" onclick="filterTodos('completed')">Completed</button>
        </div>

        <div class="todo-list">
            <div id="todos"></div>
        </div>
    </div>

    <script>
        let currentFilter = 'all';
        
        function loadTodos() {
            fetch('/api/todos')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('activeTodos').textContent = data.active;
                    document.getElementById('completedTodos').textContent = data.completed;
                    renderTodos(data.todos);
                });
        }

        function renderTodos(todos) {
            const filtered = currentFilter === 'all' ? todos : 
                            currentFilter === 'active' ? todos.filter(t => !t.completed) :
                            todos.filter(t => t.completed);
            
            const html = filtered.map(t => 
                '<div class="todo-item ' + (t.completed ? 'completed' : '') + '">' +
                    '<input type="checkbox" class="todo-checkbox" ' + (t.completed ? 'checked' : '') + ' onchange="toggleTodo(' + t.id + ')">' +
                    '<span class="todo-text">' + t.task + '</span>' +
                    '<span class="todo-priority priority-' + t.priority + '">' + t.priority + '</span>' +
                    '<button class="delete-btn" onclick="deleteTodo(' + t.id + ')">Delete</button>' +
                '</div>'
            ).join('');
            document.getElementById('todos').innerHTML = html || '<p>No todos yet</p>';
        }

        function filterTodos(filter) {
            currentFilter = filter;
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            event.target.classList.add('active');
            loadTodos();
        }

        document.getElementById('todoForm').onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                task: document.getElementById('task').value,
                category: document.getElementById('category').value,
                priority: document.getElementById('priority').value
            };
            await fetch('/api/todos', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            e.target.reset();
            loadTodos();
        };

        async function toggleTodo(id) {
            await fetch('/api/todos/' + id + '/toggle', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'}
            });
            loadTodos();
        }

        async function deleteTodo(id) {
            await fetch('/api/todos/' + id, {
                method: 'DELETE',
                headers: {'Content-Type': 'application/json'}
            });
            loadTodos();
        }

        loadTodos();
        setInterval(loadTodos, 5000);
    </script>
</body>
</html>
    `);
});

app.get("/api/todos", (req, res) => {
  console.log(`[INFO] Fetching todos - Total: ${todos.length}`);
  const active = todos.filter((t) => !t.completed).length;
  const completed = todos.filter((t) => t.completed).length;
  res.json({
    total: todos.length,
    active: active,
    completed: completed,
    todos: todos.slice().reverse(),
  });
});

app.post("/api/todos", (req, res) => {
  const { task, category, priority } = req.body;

  // Validate input
  if (!task || !category) {
    return res
      .status(400)
      .json({ success: false, error: "Missing required fields" });
  }

  const entry = {
    ...req.body,
    completed: false,
    timestamp: new Date().toISOString(),
    id: Date.now(),
  };
  todos.push(entry);

  // ── Record business metrics ──────────────────────────────────────────────
  todoCreatedTotal.labels(priority || "low").inc();
  updateTodoMetrics();
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    `[SUCCESS] Todo created: ${task} (${priority} priority, ${category})`,
  );
  res.json({ success: true, entry });
});

app.put("/api/todos/:id/toggle", (req, res) => {
  const id = parseInt(req.params.id);
  const todo = todos.find((t) => t.id === id);

  if (!todo) {
    return res.status(404).json({ success: false, error: "Todo not found" });
  }

  const wasCompleted = todo.completed;
  todo.completed = !todo.completed;
  todo.completedAt = todo.completed ? new Date().toISOString() : null;

  // ── Record business metrics ──────────────────────────────────────────────
  if (todo.completed && !wasCompleted) {
    todoCompletedTotal.labels(todo.priority || "low").inc();
  }
  updateTodoMetrics();
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    `[SUCCESS] Todo toggled: ${todo.task} -> ${todo.completed ? "completed" : "active"}`,
  );
  res.json({ success: true, todo });
});

app.delete("/api/todos/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const index = todos.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: "Todo not found" });
  }

  const deleted = todos.splice(index, 1)[0];

  // ── Record business metrics ──────────────────────────────────────────────
  todoDeletedTotal.inc();
  updateTodoMetrics();
  // ─────────────────────────────────────────────────────────────────────────

  console.log(`[SUCCESS] Todo deleted: ${deleted.task}`);
  res.json({ success: true });
});

app.get("/api/info", (req, res) => {
  console.log("[INFO] System info requested");
  res.json({
    version,
    deploymentTime,
    status: "running",
    totalTodos: todos.length,
    activeTodos: todos.filter((t) => !t.completed).length,
    completedTodos: todos.filter((t) => t.completed).length,
    totalRequests: requestCount,
  });
});

app.get("/health", (req, res) => {
  console.log("[HEALTH] Health check performed");
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

if (require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;
