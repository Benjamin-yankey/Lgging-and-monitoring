# Observability Incident Response Report

## Symptom → Trace → Root Cause Analysis

**Document Version:** 1.0  
**Application:** Obs-Todo Node.js Application  
**Infrastructure:** AWS EC2 with Prometheus, Grafana, Jaeger  
**Date:** February 2026

---

## Executive Summary

This report demonstrates the observability capabilities of our monitoring infrastructure by documenting common incident scenarios. Each scenario follows the structured debugging methodology: **Symptom Detection (Grafana/Prometheus) → Distributed Tracing (Jaeger) → Root Cause Identification (Logs)**.

The observability stack enables rapid incident diagnosis through:

- **RED Metrics** (Rate, Errors, Duration) for immediate symptom detection
- **Distributed Tracing** for request path analysis across services
- **Structured Logging** with correlation IDs for deep-dive investigation

---

## Incident Scenario 1: High Error Rate Detected

### Symptom Detection (Grafana Dashboard)

**Observation Point:** Grafana Dashboard → Node.js E2E Observability Panel

```
Alert Triggered: HighErrorRate
Error Rate: 15.3% (threshold: 5%)
Time Window: 10 minutes
Affected Endpoint: POST /api/todos
Status Code Distribution: 400 (Bad Request) - 73%, 500 (Internal) - 27%
```

**Grafana Query Used:**

```promql
(sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m]))) * 100
```

**Visual Indicators:**

- Error Rate panel shows red background (threshold exceeded)
- Throughput remains normal at 12 req/s
- P95 Latency increased to 450ms (normal: 50ms)

---

### Distributed Tracing (Jaeger)

**Jaeger Search Parameters:**

- Service: `obs-todo-app`
- Operation: `POST /api/todos`
- Lookback: Last 1 hour
- Tags: `error=true`

**Trace Analysis:**

| Span | Service      | Operation           | Duration | Error |
| ---- | ------------ | ------------------- | -------- | ----- |
| 1    | obs-todo-app | POST /api/todos     | 145ms    | true  |
| 2    | obs-todo-app | express-validation  | 2ms      | false |
| 3    | obs-todo-app | create-todo-handler | 140ms    | true  |
| 4    | obs-todo-app | database-write      | 138ms    | false |

**Key Trace Findings:**

- The error occurs in the `create-todo-handler` span
- Database write completes successfully (138ms)
- Error happens after database operation completes
- **Span Tags Found:**
  - `http.status_code`: 400
  - `error`: true
  - `validation.errors`: "Task field is required"

---

### Root Cause Identification (Logs)

**Log Search:** Query Jaeger trace ID or search logs for timestamp

**Relevant Log Entries:**

```json
{
  "timestamp": "2026-02-26T14:05:23.145Z",
  "level": "info",
  "message": "POST /api/todos - Request #4823",
  "trace_id": "4f8a2b1c3d4e5f6a7b8c9d0e1f2a3b4c",
  "span_id": "a1b2c3d4e5f6a7b8c",
  "method": "POST",
  "path": "/api/todos"
}
```

```json
{
  "timestamp": "2026-02-26T14:05:23.278Z",
  "level": "error",
  "message": "Validation failed for POST /api/todos",
  "trace_id": "4f8a2b1c3d4e5f6a7b8c9d0e1f2a3b4c",
  "span_id": "a1b2c3d4e5f6a7b8c",
  "errors": [{ "field": "task", "message": "Task field is required" }],
  "request_body": { "category": "work", "priority": "high" }
}
```

**Root Cause:**
Client applications are sending POST requests to `/api/todos` without the required `task` field. The validation middleware correctly rejects these requests with 400 Bad Request, but the high volume indicates a client-side bug or API integration issue.

**Remediation:**

1. Deploy client-side fix to include required `task` field
2. Add more descriptive error messages in API response
3. Consider adding a "dry-run" endpoint for validation before submission

---

## Incident Scenario 2: High Latency Spike

### Symptom Detection (Grafana Dashboard)

**Observation Point:** Grafana Dashboard → P95 Latency Panel

```
Alert Triggered: HighLatency
P95 Latency: 2.3 seconds (threshold: 300ms)
Time Window: 15 minutes
Endpoint Impact: GET /api/todos (all requests)
```

**Grafana Query:**

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))
```

**Additional Metrics Observed:**

- CPU Usage: 85% (normal: 15%)
- Memory Usage: 780MB (normal: 120MB)
- In-flight Requests: 45 (normal: 5-10)
- Database Query Time: 1800ms (normal: 5ms)

---

### Distributed Tracing (Jaeger)

**Jaeger Findings:**

| Span | Service      | Operation         | Duration | Parent |
| ---- | ------------ | ----------------- | -------- | ------ |
| 1    | obs-todo-app | GET /api/todos    | 2300ms   | -      |
| 2    | obs-todo-app | getAllTodos       | 2295ms   | 1      |
| 3    | obs-todo-app | array-sort        | 50ms     | 2      |
| 4    | obs-todo-app | getTodoById (x50) | 2200ms   | 2      |

**Critical Discovery:**

- 50 individual `getTodoById` calls are being made
- Each call takes ~44ms (database query)
- Total: 50 × 44ms = 2200ms just for database reads
- This is an N+1 query problem

**Jaeger Span Detail:**

```json
{
  "operation": "getTodoById",
  "duration": 44.2,
  "tags": {
    "db.statement": "SELECT * FROM todos WHERE id = ?",
    "db.type": "sqlite",
    "todo_id": 42
  }
}
```

---

### Root Cause Identification (Code Analysis)

**Code Path Analysis - app.js:**

The frontend is making a separate API call for each todo item to check completion status:

```javascript
// Frontend code (in app.js HTML)
function renderTodos(todos) {
  todos.forEach((todo) => {
    // This causes N+1 problem!
    fetch(`/api/todos/${todo.id}`).then((r) => r.json());
  });
}
```

**Database Query Pattern:**

```
SELECT * FROM todos WHERE id = 1;    -- 5ms
SELECT * FROM todos WHERE id = 2;    -- 6ms
SELECT * FROM todos WHERE id = 3;    -- 5ms
... (50 total queries)
```

**Root Cause:**
The todo list frontend makes individual GET requests for each todo item instead of using the bulk `/api/todos` endpoint that returns all todos in a single response. With 50 todos, this results in 50 sequential database queries.

**Remediation:**

1. **Immediate:** Fix frontend to use existing `/api/todos` response
2. **Long-term:** Add database query optimization with indexes
3. **Monitoring:** Add histogram metric for `db_query_duration_seconds`

---

## Incident Scenario 3: Service Unavailable (Instance Down)

### Symptom Detection (Grafana/Prometheus)

```
Alert Triggered: InstanceDown
Instance: obs-node-app:5000
Status: DOWN
Duration: 5 minutes
```

**Prometheus Query:**

```promql
up{job="obs-node-app"}
```

**Expected Result:** `1` (UP)  
**Actual Result:** `0` (DOWN)

**Additional Observations:**

- Node Exporter still responding (system metrics available)
- No new traces in Jaeger
- No new log entries after incident start time

---

### Trace Investigation (Jaeger)

**Jaeger Status:**

- Service `obs-todo-app` shows last traces from 5 minutes ago
- No new spans being created
- Search returns "No traces found" for recent time range

**Conclusion:** Application process has terminated or is unresponsive

---

### Root Cause Investigation

**SSH Access to EC2 Instance:**

```bash
$ ssh ec2-user@10.0.2.145 "docker ps"
CONTAINER ID   IMAGE          STATUS
obs-jaeger     jaegertr...    Up 2 hours
obs-prom...    prom/prom...   Up 2 hours
# node-app container NOT RUNNING
```

**Container Logs:**

```bash
$ ssh ec2-user@10.0.2.145 "docker logs node-app --tail 50"
...
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
...
```

**System Metrics (from Node Exporter):**

- Memory Available: 0 MB (completely exhausted)
- Swap Usage: 100%
- OOM Killer activated

**Root Cause:**
The Node.js application ran out of memory due to:

1. Memory leak from unbounded cache growth
2. Insufficient heap size allocation (default 1.4GB on t3.micro with 1GB RAM)
3. No memory limit in Docker container

**Remediation:**

1. Add memory limits to Dockerfile/docker-compose:

```yaml
deploy:
  resources:
    limits:
      memory: 512M
```

2. Set Node.js heap size: `NODE_OPTIONS="--max-old-space-size=384"`
3. Add memory monitoring alert before exhaustion
4. Fix memory leak in application code

---

## Alert Configuration Summary

### Prometheus Alert Rules (monitoring/alert_rules.yml)

| Alert Name         | Expression                      | Threshold | Duration | Severity |
| ------------------ | ------------------------------- | --------- | -------- | -------- |
| HighErrorRate      | rate(errors)/rate(requests)     | > 5%      | 10m      | Critical |
| HighLatency        | histogram_quantile(0.95, ...)   | > 300ms   | 10m      | Warning  |
| InstanceDown       | up == 0                         | = 0       | 1m       | Critical |
| HighMemoryUsage    | process_resident_memory_bytes   | > 500MB   | 5m       | Warning  |
| HighCPUUsage       | rate(process_cpu_seconds_total) | > 80%     | 5m       | Warning  |
| RequestQueueLength | http_requests_in_flight         | > 50      | 2m       | Warning  |

### Additional Recommended Alerts

```yaml
- alert: HighMemoryUsage
  expr: process_resident_memory_bytes / 1024 / 1024 > 500
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High memory usage detected"
    description: "Memory usage is {{ $value }}MB (threshold: 500MB)"

- alert: HighCPUUsage
  expr: rate(process_cpu_seconds_total[5m]) * 100 > 80
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High CPU usage detected"
    description: "CPU usage is {{ $value }}% (threshold: 80%)"

- alert: RequestQueueOverflow
  expr: sum(http_requests_in_flight) > 50
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Request queue overflow"
    description: "{{ $value }} requests in flight (threshold: 50)"
```

---

## Debugging Workflow Summary

### Step 1: Symptom Detection (30 seconds)

1. Check Grafana dashboard for RED metrics anomalies
2. Review active Prometheus alerts
3. Identify affected endpoints and error types

### Step 2: Trace Analysis (2-5 minutes)

1. Open Jaeger with time range of incident
2. Filter by service and error tags
3. Identify slowest spans or error locations

### Step 3: Root Cause (5-15 minutes)

1. Search logs with trace_id from Jaeger
2. Analyze error messages and stack traces
3. Check system metrics (CPU, memory, disk)
4. Review recent deployments/changes

### Step 4: Remediation

1. Implement fix based on root cause
2. Deploy via CI/CD pipeline
3. Verify metrics return to normal
4. Document incident and resolution

---

## Screenshots Reference

| Screenshot         | Location                                        | Purpose                       |
| ------------------ | ----------------------------------------------- | ----------------------------- |
| Grafana Dashboard  | screenshots/GrafanaDashboard.png                | RED metrics visualization     |
| Jaeger Traces      | screenshots/Jaeger.png                          | Distributed trace examples    |
| Prometheus Targets | screenshots/prome.png                           | Target status monitoring      |
| Pipeline Success   | screenshots/successful_pipeline.png             | CI/CD deployment verification |
| App Running        | screenshots/successfull_app_deployment_site.png | Application status            |

---

## Conclusion

This observability infrastructure enables systematic incident diagnosis through:

1. **Immediate Detection:** Grafana alerts notify within minutes of anomalies
2. **Precise Tracing:** Jaeger provides end-to-end visibility across request paths
3. **Correlated Logging:** Structured logs with trace IDs connect metrics to events
4. **Actionable Metrics:** RED metrics provide clear SLO indicators

The combination of Prometheus (metrics), Jaeger (tracing), and Grafana (visualization) creates a powerful debugging toolkit that reduces MTTR (Mean Time To Resolution) from hours to minutes.

---

_Report Generated: February 2026_  
_Monitoring Stack: Prometheus (port 9090) | Grafana (port 3000) | Jaeger (port 16686)_
