const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  savePipelineParams,
  getPipelineParams,
  savePressureSnapshot,
  getPressureSnapshots,
  getEnvelopeAnalysis
} = require('./database');

const {
  ProtectionRecommender,
  ProtectionMeasures,
  MaterialParameters
} = require('./backend/waterHammerProtection');

const recommender = new ProtectionRecommender();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/params', async (req, res) => {
  try {
    const params = await getPipelineParams();
    res.json({ success: true, data: params });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/params/:id', async (req, res) => {
  try {
    const param = await getPipelineParams(req.params.id);
    res.json({ success: true, data: param });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/params', async (req, res) => {
  try {
    const id = await savePipelineParams(req.body);
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/snapshots', async (req, res) => {
  try {
    const { paramId } = req.query;
    const snapshots = await getPressureSnapshots(paramId ? parseInt(paramId) : null);
    res.json({ success: true, data: snapshots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/snapshots', async (req, res) => {
  try {
    const id = await savePressureSnapshot(req.body);
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/snapshots/batch', async (req, res) => {
  try {
    const { snapshots } = req.body;
    const ids = [];
    for (const snapshot of snapshots) {
      const id = await savePressureSnapshot(snapshot);
      ids.push(id);
    }
    res.json({ success: true, ids });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/envelope/:paramId', async (req, res) => {
  try {
    const envelope = await getEnvelopeAnalysis(req.params.paramId);
    res.json({ success: true, data: envelope });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/protection/measures', (req, res) => {
  try {
    const measures = recommender.getAllMeasures();
    res.json({ success: true, data: measures });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/protection/measures/:id', (req, res) => {
  try {
    const measure = recommender.getMeasureById(req.params.id);
    if (!measure) {
      return res.status(404).json({ success: false, error: '防护措施不存在' });
    }
    res.json({ success: true, data: measure });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/protection/materials', (req, res) => {
  try {
    res.json({ success: true, data: MaterialParameters });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/protection/analyze-risk', (req, res) => {
  try {
    const riskAnalysis = recommender.analyzeSystemRisk(req.body);
    res.json({ success: true, data: riskAnalysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/protection/recommend', (req, res) => {
  try {
    const { systemParams, constraints } = req.body;
    const recommendations = recommender.recommendMeasures(systemParams, constraints || {});
    res.json({ success: true, data: recommendations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/protection/compare', (req, res) => {
  try {
    const { measureIds, systemParams } = req.body;
    const comparison = recommender.compareMeasures(measureIds, systemParams);
    res.json({ success: true, data: comparison });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/protection/report', (req, res) => {
  try {
    const { systemParams, constraints } = req.body;
    const report = recommender.generateProtectionReport(systemParams, constraints || {});
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`水锤压力波模拟服务器运行在 http://localhost:${PORT}`);
});
