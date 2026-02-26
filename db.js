const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'todos.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'work',
      priority TEXT NOT NULL DEFAULT 'medium',
      dueDate TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      completedAt TEXT,
      tags TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed)');
  db.run('CREATE INDEX IF NOT EXISTS idx_todos_category ON todos(category)');
  db.run('CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority)');
  db.run('CREATE INDEX IF NOT EXISTS idx_todos_dueDate ON todos(dueDate)');
});

module.exports = db;
