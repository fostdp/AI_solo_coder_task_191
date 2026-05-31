class App {
  constructor() {
    this.canvas = document.getElementById('simulationCanvas');
    this.renderer = new CanvasRenderer(this.canvas);
    this.simulation = new WaterHammerSimulation();
    
    this.animationId = null;
    this.lastTime = 0;
    this.playbackSpeed = 1;
    this.snapshots = [];
    this.currentParamId = null;
    this.historyUpdateCounter = 0;
    this.snapshotCounter = 0;
    this.comparisonWaves = [];
    this.comparisonCounter = 0;
    
    this.materialParams = {
      steel: { name: '钢管', waveSpeed: 1000 },
      castIron: { name: '铸铁管', waveSpeed: 1200 },
      pvc: { name: 'PVC管', waveSpeed: 400 },
      hdpe: { name: 'HDPE管', waveSpeed: 350 },
      concrete: { name: '混凝土管', waveSpeed: 800 }
    };
    
    this.initEventListeners();
    this.updateParameterVisuals();
    this.updateUI();
    this.updateRiskIndicator();
    this.render();
  }
  
  initEventListeners() {
    document.getElementById('startBtn').addEventListener('click', () => this.start());
    document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
    document.getElementById('resetBtn').addEventListener('click', () => this.reset());
    
    document.getElementById('speedSlider').addEventListener('input', (e) => {
      this.playbackSpeed = parseFloat(e.target.value);
      document.getElementById('speedValue').textContent = this.playbackSpeed.toFixed(1) + 'x';
    });
    
    this.bindDualInput('pipeLength', 100, 5000, (val) => {
      if (!this.simulation.isRunning) {
        this.simulation.updateParameters({ pipeLength: val });
        this.updateParameterVisuals();
        this.updateRiskIndicator();
      }
    });
    
    this.bindDualInput('pipeDiameter', 0.2, 2, (val) => {
      if (!this.simulation.isRunning) {
        this.simulation.updateParameters({ pipeDiameter: val });
        this.updateParameterVisuals();
        this.updateRiskIndicator();
      }
    });
    
    this.bindDualInput('waveSpeed', 200, 1500, (val) => {
      if (!this.simulation.isRunning) {
        this.simulation.updateParameters({ waveSpeed: val });
        this.updateParameterVisuals();
        this.updateRiskIndicator();
      }
    });
    
    this.bindDualInput('staticPressure', 0, 2, (val) => {
      if (!this.simulation.isRunning) {
        this.updateRiskIndicator();
      }
    });
    
    this.bindDualInput('initialVelocity', 0.5, 5, (val) => {
      if (!this.simulation.isRunning) {
        this.simulation.updateParameters({ initialVelocity: val });
        this.updateParameterVisuals();
        this.updateRiskIndicator();
      }
    });
    
    this.bindDualInput('valveCloseTime', 0.1, 10, (val) => {
      if (!this.simulation.isRunning) {
        this.simulation.updateParameters({ valveCloseTime: val });
        this.updateParameterVisuals();
        this.updateRiskIndicator();
      }
    });
    
    document.getElementById('pipeMaterial').addEventListener('change', (e) => {
      if (!this.simulation.isRunning) {
        const material = e.target.value;
        const waveSpeed = this.materialParams[material]?.waveSpeed || 1000;
        this.simulation.updateParameters({ waveSpeed });
        document.getElementById('waveSpeed').value = waveSpeed;
        document.getElementById('waveSpeedSlider').value = waveSpeed;
        this.updateParameterVisuals();
        this.updateRiskIndicator();
      }
    });
    
    document.getElementById('valveCurve').addEventListener('change', (e) => {
      if (!this.simulation.isRunning) {
        this.simulation.setValveCurve(e.target.value);
      }
    });
    
    document.getElementById('showEnvelope').addEventListener('change', (e) => {
      this.renderer.showEnvelope = e.target.checked;
      this.render();
    });
    
    document.getElementById('show3DPipe').addEventListener('change', (e) => {
      this.renderer.show3DPipe = e.target.checked;
      this.render();
    });
    
    document.getElementById('showGradient').addEventListener('change', (e) => {
      this.renderer.showPressureGradient = e.target.checked;
      this.render();
    });
    
    document.getElementById('captureWaveBtn').addEventListener('click', () => this.captureWaveForComparison());
    document.getElementById('clearComparisonBtn').addEventListener('click', () => this.clearComparisonWaves());
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });
    
    document.getElementById('analyzeRiskBtn').addEventListener('click', () => this.analyzeRisk());
    document.getElementById('getRecommendationsBtn').addEventListener('click', () => this.getRecommendations());
    document.getElementById('compareMeasuresBtn').addEventListener('click', () => this.compareMeasures());
    document.getElementById('generateReportBtn').addEventListener('click', () => this.generateReport());
    
    document.getElementById('saveParamsBtn').addEventListener('click', () => this.saveParams());
    document.getElementById('loadParamsBtn').addEventListener('click', () => this.loadParams());
    document.getElementById('saveSnapshotBtn').addEventListener('click', () => this.saveFullSnapshot());
    document.getElementById('exportEnvelopeBtn').addEventListener('click', () => this.exportEnvelopeJSON());
    document.getElementById('exportCSVBtn').addEventListener('click', () => this.exportEnvelopeCSV());
    
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') this.closeModal();
    });
    
    window.addEventListener('resize', () => {
      const container = this.canvas.parentElement;
      const rect = container.getBoundingClientRect();
      const width = Math.min(rect.width - 2, 1200);
      const height = Math.min(width * 0.5, 500);
      this.renderer.resize(width, height);
      this.render();
    });
    
    setTimeout(() => {
      const container = this.canvas.parentElement;
      const rect = container.getBoundingClientRect();
      const width = Math.min(rect.width - 2, 1200);
      const height = Math.min(width * 0.5, 500);
      this.renderer.resize(width, height);
      this.render();
    }, 100);
  }
  
  bindDualInput(name, min, max, callback) {
    const slider = document.getElementById(name + 'Slider');
    const number = document.getElementById(name);
    
    if (slider && number) {
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        number.value = val;
        callback(val);
      });
      
      number.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        val = Math.max(min, Math.min(max, val));
        e.target.value = val;
        slider.value = val;
        callback(val);
      });
    }
  }
  
  updateParameterVisuals() {
    const pipeLength = this.simulation.pipeLength;
    const lengthVisual = document.getElementById('pipeLengthVisual');
    if (lengthVisual) {
      const percent = ((pipeLength - 100) / 4900) * 100;
      lengthVisual.style.setProperty('--visual-width', percent + '%');
    }
    
    const pipeDiameter = this.simulation.pipeDiameter;
    const diameterVisual = document.getElementById('pipeDiameterVisual');
    if (diameterVisual) {
      const percent = ((pipeDiameter - 0.2) / 1.8) * 100;
      diameterVisual.style.setProperty('--visual-width', percent + '%');
    }
  }
  
  updateRiskIndicator() {
    const params = {
      pipeLength: this.simulation.pipeLength,
      pipeDiameter: this.simulation.pipeDiameter,
      waveSpeed: this.simulation.waveSpeed,
      initialVelocity: this.simulation.initialVelocity,
      valveCloseTime: this.simulation.valveCloseTime,
      staticPressure: parseFloat(document.getElementById('staticPressure').value) || 0,
      pipeMaterial: document.getElementById('pipeMaterial').value
    };
    
    const theoreticalMax = params.initialVelocity * params.waveSpeed * 1000 / 1e6;
    const totalMax = theoreticalMax + params.staticPressure;
    const material = this.materialParams[params.pipeMaterial] || { name: '钢管', waveSpeed: 1000 };
    const materialLimit = params.pipeMaterial === 'steel' ? 16 : 
                         params.pipeMaterial === 'castIron' ? 4 :
                         params.pipeMaterial === 'pvc' ? 2.5 :
                         params.pipeMaterial === 'hdpe' ? 2 : 3;
    
    const safetyFactor = materialLimit / totalMax;
    let riskLevel, riskText;
    
    if (safetyFactor < 1) {
      riskLevel = 'critical';
      riskText = '严重风险';
    } else if (safetyFactor < 1.5) {
      riskLevel = 'high';
      riskText = '高风险';
    } else if (safetyFactor < 2) {
      riskLevel = 'medium';
      riskText = '中风险';
    } else {
      riskLevel = 'low';
      riskText = '低风险';
    }
    
    const badge = document.getElementById('riskBadge');
    badge.className = `risk-badge risk-${riskLevel}`;
    badge.textContent = riskText;
  }
  
  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
  }
  
  start() {
    if (!this.simulation.network.isRunning) {
      this.simulation.network.isRunning = true;
      this.updateStatus('运行中', 'running');
      this.animate();
    }
  }
  
  pause() {
    this.simulation.network.isRunning = false;
    this.updateStatus('已暂停', 'paused');
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  reset() {
    this.pause();
    this.simulation.reset();
    this.snapshots = [];
    this.renderer.waveHistory = [];
    this.historyUpdateCounter = 0;
    this.snapshotCounter = 0;
    this.updateUI();
    this.render();
    this.updateStatus('就绪', 'ready');
    this.updateRiskIndicator();
  }
  
  animate() {
    if (!this.simulation.network.isRunning) return;
    
    const stepsPerFrame = Math.ceil(this.playbackSpeed * 5);
    for (let i = 0; i < stepsPerFrame; i++) {
      this.simulation.step();
      
      this.historyUpdateCounter++;
      if (this.historyUpdateCounter >= 10) {
        this.renderer.updateWaveHistory(this.simulation);
        this.historyUpdateCounter = 0;
      }
      
      this.snapshotCounter++;
      if (this.snapshotCounter >= 50 && this.currentParamId) {
        this.autoSaveSnapshot();
        this.snapshotCounter = 0;
      }
    }
    
    this.updateUI();
    this.render();
    
    if (this.simulation.currentTime < 15) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.pause();
      this.updateStatus('模拟完成', 'complete');
      if (this.currentParamId) {
        this.saveFullSnapshot();
      }
    }
  }
  
  render() {
    this.renderer.render(this.simulation, this.simulation.currentTime);
  }
  
  updateUI() {
    document.getElementById('currentTime').textContent = 
      this.simulation.currentTime.toFixed(3) + ' s';
    document.getElementById('maxPressure').textContent = 
      this.simulation.getMaxPressureMPa().toFixed(3) + ' MPa';
    document.getElementById('minPressure').textContent = 
      this.simulation.getMinPressureMPa().toFixed(3) + ' MPa';
    document.getElementById('valveOpening').textContent = 
      Math.round(this.simulation.valveOpening * 100) + '%';
    document.getElementById('theoreticalMax').textContent = 
      this.simulation.theoreticalMaxPressure.toFixed(2) + ' MPa';
  }
  
  updateStatus(status, className) {
    const el = document.getElementById('simulationStatus');
    el.textContent = status;
    el.className = `value status-${className || 'ready'}`;
  }
  
  captureWaveForComparison() {
    const pressureData = this.simulation.getPressureData();
    const maxPressure = this.simulation.getMaxPressureMPa();
    const minPressure = this.simulation.getMinPressureMPa();
    
    this.comparisonCounter++;
    const name = `工况 ${this.comparisonCounter}: L=${this.simulation.pipeLength}m, V0=${this.simulation.initialVelocity}m/s, Tc=${this.simulation.valveCloseTime}s`;
    const color = this.renderer.comparisonColors[(this.comparisonCounter - 1) % 5];
    
    this.comparisonWaves.push({
      name,
      data: pressureData,
      maxPressure,
      minPressure,
      params: {
        pipeLength: this.simulation.pipeLength,
        pipeDiameter: this.simulation.pipeDiameter,
        initialVelocity: this.simulation.initialVelocity,
        valveCloseTime: this.simulation.valveCloseTime,
        valveCurve: document.getElementById('valveCurve').value
      },
      color
    });
    
    this.renderer.addComparisonWave(name, pressureData, color);
    this.updateComparisonList();
    this.render();
  }
  
  clearComparisonWaves() {
    this.comparisonWaves = [];
    this.comparisonCounter = 0;
    this.renderer.clearComparisonWaves();
    this.updateComparisonList();
    this.render();
  }
  
  updateComparisonList() {
    const listEl = document.getElementById('comparisonList');
    const statsEl = document.getElementById('comparisonStats');
    
    if (this.comparisonWaves.length === 0) {
      listEl.innerHTML = '<p class="hint">暂无对比波形。点击模拟区工具栏的"捕获波形对比"按钮添加。</p>';
      statsEl.innerHTML = '<p class="hint">暂无统计数据</p>';
      return;
    }
    
    listEl.innerHTML = '';
    this.comparisonWaves.forEach((wave, index) => {
      const item = document.createElement('div');
      item.className = 'comparison-item';
      item.style.borderLeftColor = wave.color;
      item.innerHTML = `
        <div class="comparison-info">
          <h5>${wave.name}</h5>
          <p>最大压力: ${wave.maxPressure.toFixed(3)} MPa | 最小压力: ${wave.minPressure.toFixed(3)} MPa</p>
        </div>
        <button class="comparison-remove" data-index="${index}">&times;</button>
      `;
      listEl.appendChild(item);
    });
    
    listEl.querySelectorAll('.comparison-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.removeComparisonWave(index);
      });
    });
    
    statsEl.innerHTML = `
      <table class="stats-table">
        <thead>
          <tr>
            <th>工况</th>
            <th>管长(m)</th>
            <th>流速(m/s)</th>
            <th>关闭时间(s)</th>
            <th>最大压力(MPa)</th>
            <th>最小压力(MPa)</th>
          </tr>
        </thead>
        <tbody>
          ${this.comparisonWaves.map((wave, i) => `
            <tr>
              <td style="color: ${wave.color}; font-weight: bold;">#${i + 1}</td>
              <td>${wave.params.pipeLength}</td>
              <td>${wave.params.initialVelocity}</td>
              <td>${wave.params.valveCloseTime}</td>
              <td class="${wave.maxPressure > 3 ? 'poor-value' : wave.maxPressure > 1.5 ? 'moderate-value' : 'good-value'}">${wave.maxPressure.toFixed(2)}</td>
              <td class="${wave.minPressure < -0.5 ? 'poor-value' : wave.minPressure < -0.1 ? 'moderate-value' : 'good-value'}">${wave.minPressure.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  removeComparisonWave(index) {
    this.comparisonWaves.splice(index, 1);
    this.renderer.comparisonWaves = this.comparisonWaves.map(w => ({
      name: w.name,
      data: w.data,
      color: w.color
    }));
    this.updateComparisonList();
    this.render();
  }
  
  async analyzeRisk() {
    const params = {
      pipeLength: this.simulation.pipeLength,
      pipeDiameter: this.simulation.pipeDiameter,
      waveSpeed: this.simulation.waveSpeed,
      initialVelocity: this.simulation.initialVelocity,
      valveCloseTime: this.simulation.valveCloseTime,
      staticPressure: parseFloat(document.getElementById('staticPressure').value) || 0,
      pipeMaterial: document.getElementById('pipeMaterial').value
    };
    
    try {
      const response = await fetch('/api/protection/analyze-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      
      if (result.success) {
        const risk = result.data;
        const riskLevel = risk.riskLevel;
        
        document.getElementById('riskAnalysisResult').innerHTML = `
          <div class="risk-summary ${riskLevel}">
            <h4>风险等级: ${this.getRiskText(riskLevel)}</h4>
            <p>${risk.riskDescription}</p>
          </div>
          <div class="risk-details">
            <p>理论最大水锤压力: <strong>${risk.theoreticalMaxPressure.toFixed(3)} MPa</strong></p>
            <p>总最大压力(含静压): <strong>${risk.totalMaxPressure.toFixed(3)} MPa</strong></p>
            <p>管道承压极限: <strong>${risk.materialPressureLimit} MPa</strong></p>
            <p>安全系数: <strong>${risk.safetyFactor.toFixed(2)}</strong></p>
            <p>波往返时间: <strong>${risk.roundTripTime.toFixed(3)} s</strong></p>
            <p>关闭时间/波往返时间: <strong>${risk.closeRatio.toFixed(2)}</strong></p>
            <p>负压风险: <strong>${risk.negativePressureRisk ? '存在' : '无'}</strong></p>
          </div>
        `;
      }
    } catch (error) {
      document.getElementById('riskAnalysisResult').innerHTML = 
        '<p class="hint" style="color: #ff6b6b;">风险分析失败，请确保服务器正在运行</p>';
    }
  }
  
  getRiskText(level) {
    const texts = {
      critical: '🔴 严重风险',
      high: '🟠 高风险',
      medium: '🟡 中风险',
      low: '🟢 低风险'
    };
    return texts[level] || level;
  }
  
  async getRecommendations() {
    const systemParams = {
      pipeLength: this.simulation.pipeLength,
      pipeDiameter: this.simulation.pipeDiameter,
      waveSpeed: this.simulation.waveSpeed,
      initialVelocity: this.simulation.initialVelocity,
      valveCloseTime: this.simulation.valveCloseTime,
      staticPressure: parseFloat(document.getElementById('staticPressure').value) || 0,
      pipeMaterial: document.getElementById('pipeMaterial').value
    };
    
    const constraints = {
      maxCost: document.getElementById('budgetConstraint').value || null
    };
    
    try {
      const response = await fetch('/api/protection/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemParams, constraints })
      });
      const result = await response.json();
      
      if (result.success) {
        const data = result.data;
        
        let html = '';
        
        if (data.bestCombination) {
          html += `
            <div class="recommendation-card" style="border-left-color: #4caf50;">
              <div class="recommendation-header">
                <span class="recommendation-name">🏆 推荐最优方案</span>
              </div>
              <div class="recommendation-desc">
                ${data.bestCombination.measures.map(m => m.name).join(' + ')}
              </div>
              <div class="recommendation-effect">
                预期最大压力: ${data.bestCombination.expectedPressure.toFixed(3)} MPa | 
                安全系数: ${data.bestCombination.safetyFactor.toFixed(2)} | 
                预估成本: ${data.bestCombination.totalCost}
              </div>
            </div>
          `;
        }
        
        data.recommendations.forEach((rec, i) => {
          html += `
            <div class="recommendation-card">
              <div class="recommendation-header">
                <span class="recommendation-name">${i + 1}. ${rec.measure.name}</span>
                <span class="suitability-score">适配度: ${rec.suitability}</span>
              </div>
              <div class="recommendation-desc">${rec.measure.description}</div>
              <div class="recommendation-effect">
                预期压力: ${rec.expectedEffect.expectedPressure.toFixed(3)} MPa | 
                减压: ${((1 - rec.expectedEffect.reductionFactor) * 100).toFixed(0)}% | 
                成本: ${rec.measure.cost}
              </div>
              <div class="recommendation-desc" style="color: #666; font-size: 0.75rem; margin-top: 5px;">
                原理: ${rec.measure.principle}
              </div>
            </div>
          `;
        });
        
        document.getElementById('recommendationsResult').innerHTML = html;
      }
    } catch (error) {
      document.getElementById('recommendationsResult').innerHTML = 
        '<p class="hint" style="color: #ff6b6b;">获取推荐失败，请确保服务器正在运行</p>';
    }
  }
  
  async compareMeasures() {
    const checkboxes = document.querySelectorAll('#measureCheckboxes input:checked');
    const measureIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (measureIds.length === 0) {
      document.getElementById('comparisonResult').innerHTML = 
        '<p class="hint" style="color: #ff6b6b;">请至少选择一个防护措施</p>';
      return;
    }
    
    const systemParams = {
      pipeLength: this.simulation.pipeLength,
      pipeDiameter: this.simulation.pipeDiameter,
      waveSpeed: this.simulation.waveSpeed,
      initialVelocity: this.simulation.initialVelocity,
      valveCloseTime: this.simulation.valveCloseTime,
      staticPressure: parseFloat(document.getElementById('staticPressure').value) || 0,
      pipeMaterial: document.getElementById('pipeMaterial').value
    };
    
    try {
      const response = await fetch('/api/protection/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measureIds, systemParams })
      });
      const result = await response.json();
      
      if (result.success) {
        const comparison = result.data;
        
        document.getElementById('comparisonResult').innerHTML = `
          <table class="comparison-table">
            <thead>
              <tr>
                <th>防护措施</th>
                <th>成本</th>
                <th>无防护压力(MPa)</th>
                <th>防护后压力(MPa)</th>
                <th>减压比例</th>
                <th>效果</th>
              </tr>
            </thead>
            <tbody>
              ${comparison.map(c => `
                <tr>
                  <td style="text-align: left; font-weight: bold;">${c.name}</td>
                  <td>${c.cost}</td>
                  <td>${c.pressureWithoutProtection.toFixed(2)}</td>
                  <td class="${c.pressureWithProtection > 3 ? 'poor-value' : c.pressureWithProtection > 1.5 ? 'moderate-value' : 'good-value'}">
                    ${c.pressureWithProtection.toFixed(2)}
                  </td>
                  <td>${c.pressureReductionPercent}%</td>
                  <td>${c.note || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    } catch (error) {
      document.getElementById('comparisonResult').innerHTML = 
        '<p class="hint" style="color: #ff6b6b;">对比失败，请确保服务器正在运行</p>';
    }
  }
  
  async generateReport() {
    const systemParams = {
      pipeLength: this.simulation.pipeLength,
      pipeDiameter: this.simulation.pipeDiameter,
      waveSpeed: this.simulation.waveSpeed,
      initialVelocity: this.simulation.initialVelocity,
      valveCloseTime: this.simulation.valveCloseTime,
      staticPressure: parseFloat(document.getElementById('staticPressure').value) || 0,
      pipeMaterial: document.getElementById('pipeMaterial').value
    };
    
    const constraints = {
      maxCost: document.getElementById('budgetConstraint').value || null
    };
    
    try {
      const response = await fetch('/api/protection/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemParams, constraints })
      });
      const result = await response.json();
      
      if (result.success) {
        const report = result.data;
        
        let html = `
          <div class="report-content">
            <h2>📄 ${report.title}</h2>
            <p style="text-align: center; color: #888; margin-bottom: 20px;">
              生成时间: ${new Date(report.generatedAt).toLocaleString('zh-CN')}
            </p>
            
            <div class="report-section">
              <h3>📐 系统参数</h3>
              <ul>
                <li>管道长度: ${report.systemParameters.pipeLength} m</li>
                <li>管道直径: ${report.systemParameters.pipeDiameter} m</li>
                <li>管道材质: ${this.materialParams[report.systemParameters.pipeMaterial]?.name || '钢管'}</li>
                <li>压力波速: ${report.systemParameters.waveSpeed} m/s</li>
                <li>初始流速: ${report.systemParameters.initialVelocity} m/s</li>
                <li>阀门关闭时间: ${report.systemParameters.valveCloseTime} s</li>
                <li>静压力: ${report.systemParameters.staticPressure} MPa</li>
              </ul>
            </div>
            
            <div class="report-section">
              <h3>⚠️ 风险评估</h3>
              <div class="risk-summary ${report.riskAssessment.riskLevel}" style="margin: 10px 0;">
                <h4>风险等级: ${this.getRiskText(report.riskAssessment.riskLevel)}</h4>
                <p>${report.riskAssessment.riskDescription}</p>
              </div>
              <ul>
                <li>理论最大水锤压力: ${report.riskAssessment.theoreticalMaxPressure.toFixed(3)} MPa</li>
                <li>总最大压力: ${report.riskAssessment.totalMaxPressure.toFixed(3)} MPa</li>
                <li>管道承压极限: ${report.riskAssessment.materialPressureLimit} MPa</li>
                <li>安全系数: ${report.riskAssessment.safetyFactor.toFixed(2)}</li>
                <li>负压风险: ${report.riskAssessment.negativePressureRisk ? '存在' : '无'}</li>
              </ul>
            </div>
            
            <div class="report-section">
              <h3>💡 推荐防护措施</h3>
              <ul>
                ${report.topRecommendations.map(r => `
                  <li>
                    <strong>第${r.rank}名: ${r.name}</strong><br>
                    适配度: ${r.suitabilityScore}分 | 
                    预期压力: ${r.expectedPressure} MPa | 
                    减压: ${r.reductionPercent}% | 
                    成本: ${r.cost}
                  </li>
                `).join('')}
              </ul>
            </div>
        `;
        
        if (report.optimalCombination) {
          html += `
            <div class="report-section">
              <h3>🏆 最优防护方案</h3>
              <ul>
                <li><strong>措施组合:</strong> ${report.optimalCombination.measures.join(' + ')}</li>
                <li><strong>预期最大压力:</strong> ${report.optimalCombination.expectedPressure} MPa</li>
                <li><strong>安全系数:</strong> ${report.optimalCombination.safetyFactor}</li>
                <li><strong>预估成本:</strong> ${report.optimalCombination.estimatedCost}</li>
              </ul>
            </div>
          `;
        }
        
        html += `
            <div class="report-section">
              <h3>📋 结论与建议</h3>
              <ul>
                ${report.conclusions.map(c => `<li>${c}</li>`).join('')}
              </ul>
            </div>
          </div>
        `;
        
        this.showModal(html);
        document.getElementById('reportResult').innerHTML = 
          '<p style="color: #4caf50; text-align: center;">✓ 报告已生成，见弹窗</p>';
      }
    } catch (error) {
      document.getElementById('reportResult').innerHTML = 
        '<p class="hint" style="color: #ff6b6b;">生成报告失败，请确保服务器正在运行</p>';
    }
  }
  
  showModal(content) {
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modal').classList.remove('hidden');
  }
  
  closeModal() {
    document.getElementById('modal').classList.add('hidden');
  }
  
  async saveParams() {
    const params = {
      pipeLength: this.simulation.pipeLength,
      pipeDiameter: this.simulation.pipeDiameter,
      waveSpeed: this.simulation.waveSpeed,
      initialVelocity: this.simulation.initialVelocity,
      valveCloseTime: this.simulation.valveCloseTime,
      density: this.simulation.density,
      pipeMaterial: document.getElementById('pipeMaterial').value,
      staticPressure: parseFloat(document.getElementById('staticPressure').value) || 0,
      valveCurve: document.getElementById('valveCurve').value
    };
    
    try {
      const response = await fetch('/api/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      if (result.success) {
        this.currentParamId = result.id;
        alert(`参数已保存，ID: ${result.id}\n波往返时间: ${this.simulation.getWaveRoundTripTime().toFixed(3)}s\n理论最大压力: ${this.simulation.theoreticalMaxPressure.toFixed(2)} MPa`);
        this.loadParams();
      }
    } catch (error) {
      console.error('保存参数失败:', error);
      alert('保存参数失败，请确保服务器正在运行');
    }
  }
  
  async loadParams() {
    try {
      const response = await fetch('/api/params');
      const result = await response.json();
      if (result.success) {
        this.displayParamsList(result.data);
      }
    } catch (error) {
      console.error('加载参数失败:', error);
    }
  }
  
  displayParamsList(params) {
    const listEl = document.getElementById('paramsList');
    listEl.innerHTML = '';
    
    if (params.length === 0) {
      listEl.innerHTML = '<p class="hint">暂无保存的参数</p>';
      return;
    }
    
    params.forEach(param => {
      const item = document.createElement('div');
      item.className = 'param-item';
      const tripTime = (2 * param.pipe_length / param.wave_speed).toFixed(3);
      item.innerHTML = `
        <div>
          <span class="param-name">ID: ${param.id} - L=${param.pipe_length}m, V0=${param.initial_velocity}m/s</span>
        </div>
        <span class="param-date">Tclose=${param.valve_close_time}s</span>
      `;
      item.addEventListener('click', () => this.applyParams(param));
      listEl.appendChild(item);
    });
  }
  
  applyParams(param) {
    this.simulation.updateParameters({
      pipeLength: param.pipe_length,
      pipeDiameter: param.pipe_diameter,
      waveSpeed: param.wave_speed,
      initialVelocity: param.initial_velocity,
      valveCloseTime: param.valve_close_time
    });
    
    document.getElementById('pipeLength').value = param.pipe_length;
    document.getElementById('pipeLengthSlider').value = param.pipe_length;
    document.getElementById('pipeDiameter').value = param.pipe_diameter;
    document.getElementById('pipeDiameterSlider').value = param.pipe_diameter;
    document.getElementById('waveSpeed').value = param.wave_speed;
    document.getElementById('waveSpeedSlider').value = param.wave_speed;
    document.getElementById('initialVelocity').value = param.initial_velocity;
    document.getElementById('initialVelocitySlider').value = param.initial_velocity;
    document.getElementById('valveCloseTime').value = param.valve_close_time;
    document.getElementById('valveCloseTimeSlider').value = param.valve_close_time;
    
    if (param.pipe_material) {
      document.getElementById('pipeMaterial').value = param.pipe_material;
    }
    if (param.static_pressure !== undefined) {
      document.getElementById('staticPressure').value = param.static_pressure;
      document.getElementById('staticPressureSlider').value = param.static_pressure;
    }
    if (param.valve_curve) {
      document.getElementById('valveCurve').value = param.valve_curve;
      this.simulation.setValveCurve(param.valve_curve);
    }
    
    this.currentParamId = param.id;
    this.updateParameterVisuals();
    this.updateRiskIndicator();
    this.reset();
  }
  
  async autoSaveSnapshot() {
    if (!this.currentParamId) return;
    
    const fullSnapshot = this.simulation.getFullSnapshot();
    const snapshot = {
      paramId: this.currentParamId,
      time: fullSnapshot.time,
      maxPressure: fullSnapshot.maxPressure,
      minPressure: fullSnapshot.minPressure,
      valveOpening: fullSnapshot.valveOpening,
      pressureDistribution: fullSnapshot.pressureDistribution,
      velocityDistribution: fullSnapshot.velocityDistribution,
      pressureEnvelope: fullSnapshot.pressureEnvelope
    };
    
    try {
      await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
    } catch (error) {
      console.error('自动保存快照失败:', error);
    }
  }
  
  async saveFullSnapshot() {
    const fullSnapshot = this.simulation.getFullSnapshot();
    const snapshot = {
      paramId: this.currentParamId,
      time: fullSnapshot.time,
      maxPressure: fullSnapshot.maxPressure,
      minPressure: fullSnapshot.minPressure,
      valveOpening: fullSnapshot.valveOpening,
      pressureDistribution: fullSnapshot.pressureDistribution,
      velocityDistribution: fullSnapshot.velocityDistribution,
      pressureEnvelope: fullSnapshot.pressureEnvelope
    };
    
    try {
      const response = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      const result = await response.json();
      if (result.success) {
        const envelope = fullSnapshot.pressureEnvelope;
        const maxEnvelope = Math.max(...envelope.max) / 1e6;
        const minEnvelope = Math.min(...envelope.min) / 1e6;
        alert(`快照已保存，ID: ${result.id}\n当前时间: ${fullSnapshot.time.toFixed(3)}s\n最大压力: ${fullSnapshot.maxPressure.toFixed(3)} MPa\n最小压力: ${fullSnapshot.minPressure.toFixed(3)} MPa\n包络线最大: ${maxEnvelope.toFixed(3)} MPa\n包络线最小: ${minEnvelope.toFixed(3)} MPa`);
      }
    } catch (error) {
      console.error('保存快照失败:', error);
      alert('保存快照失败，请确保服务器正在运行');
    }
  }
  
  exportEnvelopeJSON() {
    const envelopeData = this.simulation.network.exportEnvelopeData();
    const dataStr = JSON.stringify(envelopeData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pressure-envelope-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  exportEnvelopeCSV() {
    const envelope = this.simulation.getPressureEnvelope();
    let csv = '位置(m),最大压力(MPa),最小压力(MPa),当前压力(MPa)\n';
    
    const currentPressure = this.simulation.getPressureData();
    
    for (let i = 0; i < envelope.x.length; i++) {
      csv += `${envelope.x[i].toFixed(1)},${envelope.max[i].toFixed(6)},${envelope.min[i].toFixed(6)},${currentPressure.y[i].toFixed(6)}\n`;
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pressure-envelope-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
