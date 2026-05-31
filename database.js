const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'water-hammer.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS pipeline_params (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipe_length REAL NOT NULL,
      pipe_diameter REAL NOT NULL,
      wave_speed REAL NOT NULL,
      initial_velocity REAL NOT NULL,
      valve_close_time REAL NOT NULL,
      density REAL DEFAULT 1000,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pressure_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      param_id INTEGER,
      time REAL NOT NULL,
      max_pressure REAL NOT NULL,
      min_pressure REAL NOT NULL DEFAULT 0,
      valve_opening REAL NOT NULL DEFAULT 1,
      pressure_distribution TEXT NOT NULL,
      velocity_distribution TEXT,
      pressure_envelope_max TEXT,
      pressure_envelope_min TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (param_id) REFERENCES pipeline_params(id)
    )
  `);

  db.all("PRAGMA table_info(pressure_snapshots)", (err, rows) => {
    if (err) {
      console.error('获取表信息失败:', err);
      return;
    }
    if (!rows || rows.length === 0) {
      return;
    }
    const columns = rows.map(r => r.name);
    const addColumnIfNotExists = (colName, colDef) => {
      if (!columns.includes(colName)) {
        db.run(`ALTER TABLE pressure_snapshots ADD COLUMN ${colName} ${colDef}`, (alterErr) => {
          if (alterErr) {
            console.log(`列 ${colName} 可能已存在`);
          }
        });
      }
    };
    addColumnIfNotExists('min_pressure', 'REAL NOT NULL DEFAULT 0');
    addColumnIfNotExists('valve_opening', 'REAL NOT NULL DEFAULT 1');
    addColumnIfNotExists('pressure_distribution', 'TEXT');
    addColumnIfNotExists('velocity_distribution', 'TEXT');
    addColumnIfNotExists('pressure_envelope_max', 'TEXT');
    addColumnIfNotExists('pressure_envelope_min', 'TEXT');
  });
});

function savePipelineParams(params) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO pipeline_params 
      (pipe_length, pipe_diameter, wave_speed, initial_velocity, valve_close_time, density)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      params.pipeLength,
      params.pipeDiameter,
      params.waveSpeed,
      params.initialVelocity,
      params.valveCloseTime,
      params.density || 1000,
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
    stmt.finalize();
  });
}

function getPipelineParams(id) {
  return new Promise((resolve, reject) => {
    if (id) {
      db.get('SELECT * FROM pipeline_params WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    } else {
      db.all('SELECT * FROM pipeline_params ORDER BY created_at DESC LIMIT 10', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }
  });
}

function savePressureSnapshot(snapshot) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO pressure_snapshots 
      (param_id, time, max_pressure, min_pressure, valve_opening, 
       pressure_distribution, velocity_distribution, pressure_envelope_max, pressure_envelope_min)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      snapshot.paramId || null,
      snapshot.time,
      snapshot.maxPressure,
      snapshot.minPressure || 0,
      snapshot.valveOpening !== undefined ? snapshot.valveOpening : 1,
      JSON.stringify(snapshot.pressureDistribution || snapshot.pressureData || []),
      JSON.stringify(snapshot.velocityDistribution || []),
      JSON.stringify(snapshot.pressureEnvelope?.max || []),
      JSON.stringify(snapshot.pressureEnvelope?.min || []),
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
    stmt.finalize();
  });
}

function getPressureSnapshots(paramId) {
  return new Promise((resolve, reject) => {
    const query = paramId 
      ? 'SELECT * FROM pressure_snapshots WHERE param_id = ? ORDER BY time'
      : 'SELECT * FROM pressure_snapshots ORDER BY created_at DESC LIMIT 100';
    const params = paramId ? [paramId] : [];
    
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else {
        const result = rows.map(row => ({
          ...row,
          pressureDistribution: safeJsonParse(row.pressure_distribution, []),
          velocityDistribution: safeJsonParse(row.velocity_distribution, []),
          pressureEnvelope: {
            max: safeJsonParse(row.pressure_envelope_max, []),
            min: safeJsonParse(row.pressure_envelope_min, [])
          }
        }));
        resolve(result);
      }
    });
  });
}

function safeJsonParse(str, defaultValue) {
  try {
    return str ? JSON.parse(str) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function getEnvelopeAnalysis(paramId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT time, max_pressure, min_pressure, pressure_envelope_max, pressure_envelope_min
      FROM pressure_snapshots 
      WHERE param_id = ? 
      ORDER BY time DESC
      LIMIT 1
    `, [paramId], (err, rows) => {
      if (err) reject(err);
      else if (rows.length > 0) {
        const row = rows[0];
        resolve({
          time: row.time,
          maxPressure: row.max_pressure,
          minPressure: row.min_pressure,
          envelopeMax: safeJsonParse(row.pressure_envelope_max, []),
          envelopeMin: safeJsonParse(row.pressure_envelope_min, [])
        });
      } else {
        resolve(null);
      }
    });
  });
}

module.exports = {
  savePipelineParams,
  getPipelineParams,
  savePressureSnapshot,
  getPressureSnapshots,
  getEnvelopeAnalysis
};
