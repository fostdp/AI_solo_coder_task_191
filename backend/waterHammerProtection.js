const ProtectionMeasures = {
  slowClosingValve: {
    id: 'slowClosingValve',
    name: '缓闭阀门',
    category: 'valve',
    description: '采用优化的关闭曲线，延长阀门关闭时间，降低水锤压力',
    principle: '通过延长关闭时间，使关闭时间大于波往返时间（T_close > 2L/a），利用压力波反射抵消水锤',
    effectiveness: '降低水锤压力 50% ~ 90%',
    cost: '低',
    applicableScenarios: ['泵站出口', '管道末端', '水库出口'],
    parameters: {
      closeTime: { description: '关闭时间', unit: 's', defaultValue: 3, min: 0.5, max: 30 },
      curveType: { 
        description: '关闭曲线类型', 
        defaultValue: 'optimized',
        options: ['linear', 'fastClose', 'slowClose', 'parabolic', 'twoStage', 'optimized']
      }
    },
    calculatePressureReduction: (params) => {
      const { closeTime, waveSpeed, pipeLength, initialVelocity } = params;
      const roundTripTime = 2 * pipeLength / waveSpeed;
      const ratio = closeTime / roundTripTime;
      let reductionFactor;
      if (ratio < 0.5) {
        reductionFactor = 0.95;
      } else if (ratio < 1) {
        reductionFactor = 0.7;
      } else if (ratio < 2) {
        reductionFactor = 0.4;
      } else {
        reductionFactor = 0.15;
      }
      return {
        reductionFactor,
        expectedPressure: initialVelocity * waveSpeed * 1000 * reductionFactor / 1e6
      };
    }
  },
  
  surgeTank: {
    id: 'surgeTank',
    name: '调压塔',
    category: 'storage',
    description: '在管道中部或末端设置开口或封闭容器，吸收或释放压力波动',
    principle: '利用调压塔的自由水面或气垫缓冲压力变化，减小压力波传播速度和幅值',
    effectiveness: '降低水锤压力 60% ~ 95%',
    cost: '中高',
    applicableScenarios: ['长距离输水', '水电站', '泵站系统'],
    parameters: {
      tankDiameter: { description: '调压塔直径', unit: 'm', defaultValue: 4, min: 1, max: 20 },
      tankHeight: { description: '调压塔高度', unit: 'm', defaultValue: 20, min: 5, max: 100 },
      position: { description: '安装位置（距起点比例）', unit: '', defaultValue: 0.5, min: 0, max: 1 }
    },
    calculatePressureReduction: (params) => {
      const { tankDiameter, pipeDiameter, position } = params;
      const areaRatio = Math.pow(tankDiameter / pipeDiameter, 2);
      let reductionFactor = 1;
      if (areaRatio > 5) reductionFactor = 0.1;
      else if (areaRatio > 3) reductionFactor = 0.2;
      else if (areaRatio > 2) reductionFactor = 0.35;
      else if (areaRatio > 1) reductionFactor = 0.5;
      else reductionFactor = 0.75;
      const positionBonus = 1 - Math.abs(position - 0.5) * 0.3;
      return {
        reductionFactor: reductionFactor * positionBonus,
        expectedPressure: params.initialVelocity * params.waveSpeed * 1000 * reductionFactor * positionBonus / 1e6
      };
    }
  },
  
  airChamber: {
    id: 'airChamber',
    name: '空气室',
    category: 'storage',
    description: '封闭式压力容器，利用可压缩空气吸收压力波动',
    principle: '通过空气的可压缩性吸收压力升高，在压力降低时释放能量，有效抑制正负压力波动',
    effectiveness: '降低水锤压力 70% ~ 95%',
    cost: '中',
    applicableScenarios: ['小型泵站', '高层建筑供水', '工业管道'],
    parameters: {
      volume: { description: '空气室容积', unit: 'm³', defaultValue: 10, min: 1, max: 100 },
      preChargePressure: { description: '预充压力', unit: 'MPa', defaultValue: 0.3, min: 0.1, max: 2 },
      installationPosition: { 
        description: '安装位置', 
        defaultValue: 'pumpOutlet',
        options: ['pumpOutlet', 'pipeMidpoint', 'valveUpstream']
      }
    },
    calculatePressureReduction: (params) => {
      const { volume, preChargePressure, pipeLength, initialVelocity } = params;
      const pipeVolume = Math.PI * Math.pow(params.pipeDiameter / 2, 2) * pipeLength;
      const volumeRatio = volume / pipeVolume;
      let reductionFactor = 1;
      if (volumeRatio > 0.1) reductionFactor = 0.05;
      else if (volumeRatio > 0.05) reductionFactor = 0.1;
      else if (volumeRatio > 0.02) reductionFactor = 0.2;
      else if (volumeRatio > 0.01) reductionFactor = 0.35;
      else reductionFactor = 0.6;
      return {
        reductionFactor,
        expectedPressure: initialVelocity * params.waveSpeed * 1000 * reductionFactor / 1e6
      };
    }
  },
  
  pressureReliefValve: {
    id: 'pressureReliefValve',
    name: '泄压阀',
    category: 'valve',
    description: '当管道压力超过设定值时自动开启，释放高压流体',
    principle: '在压力峰值到达前打开泄压通道，限制最大压力不超过设计值',
    effectiveness: '限制最大压力至设定值，降低超压风险 90%+',
    cost: '低中',
    applicableScenarios: ['任何需要压力保护的位置', '泵出口', '管道高点'],
    parameters: {
      setPressure: { description: '开启压力', unit: 'MPa', defaultValue: 1.5, min: 0.2, max: 10 },
      flowRate: { description: '最大泄放流量', unit: 'm³/s', defaultValue: 0.5, min: 0.1, max: 5 },
      responseTime: { description: '响应时间', unit: 's', defaultValue: 0.1, min: 0.01, max: 1 }
    },
    calculatePressureReduction: (params) => {
      const { setPressure, responseTime, waveSpeed } = params;
      const theoreticalMax = params.initialVelocity * waveSpeed * 1000 / 1e6;
      if (setPressure >= theoreticalMax) {
        return {
          reductionFactor: 1,
          expectedPressure: theoreticalMax,
          note: '开启压力高于理论最大水锤压力，无减压效果'
        };
      }
      const responseFactor = Math.min(1, 0.5 + responseTime * 5);
      return {
        reductionFactor: (setPressure / theoreticalMax) * responseFactor,
        expectedPressure: setPressure * responseFactor
      };
    }
  },
  
  bypassPipe: {
    id: 'bypassPipe',
    name: '旁通管',
    category: 'pipe',
    description: '在主阀旁并联管道，主阀关闭时流体通过旁通管流动',
    principle: '主阀快速关闭时，通过旁通管维持部分流量，避免流量骤变产生大的水锤',
    effectiveness: '降低水锤压力 40% ~ 70%',
    cost: '低中',
    applicableScenarios: ['泵站系统', '需要快速关断但允许少量泄漏的场合'],
    parameters: {
      diameterRatio: { description: '旁通管/主管直径比', unit: '', defaultValue: 0.3, min: 0.1, max: 0.6 },
      checkValve: { description: '是否带止回阀', defaultValue: true }
    },
    calculatePressureReduction: (params) => {
      const { diameterRatio, checkValve, initialVelocity, waveSpeed } = params;
      const flowRatio = Math.pow(diameterRatio, 2);
      let reductionFactor = 1 - flowRatio * 0.8;
      if (checkValve) reductionFactor *= 0.9;
      return {
        reductionFactor: Math.max(0.3, reductionFactor),
        expectedPressure: initialVelocity * waveSpeed * 1000 * reductionFactor / 1e6
      };
    }
  },
  
  oneWaySurgeTank: {
    id: 'oneWaySurgeTank',
    name: '单向调压塔',
    category: 'storage',
    description: '只在压力降低时进水，压力升高时不回水的调压设施',
    principle: '防止负压导致的液柱分离，同时在压力回升时限制流量回流',
    effectiveness: '防止负压，降低正压 40% ~ 70%',
    cost: '中',
    applicableScenarios: ['重力流管道', '地形起伏大的管道', '容易产生负压的位置'],
    parameters: {
      height: { description: '塔高', unit: 'm', defaultValue: 15, min: 3, max: 50 },
      diameter: { description: '直径', unit: 'm', defaultValue: 2, min: 0.5, max: 8 }
    },
    calculatePressureReduction: (params) => {
      const { height, diameter, pipeDiameter, initialVelocity, waveSpeed } = params;
      const volume = Math.PI * Math.pow(diameter / 2, 2) * height;
      const pipeVolume = Math.PI * Math.pow(pipeDiameter / 2, 2) * params.pipeLength;
      const ratio = volume / pipeVolume;
      let reductionFactor = 1;
      if (ratio > 0.05) reductionFactor = 0.3;
      else if (ratio > 0.02) reductionFactor = 0.4;
      else if (ratio > 0.01) reductionFactor = 0.55;
      else reductionFactor = 0.75;
      return {
        reductionFactor,
        expectedPressure: initialVelocity * waveSpeed * 1000 * reductionFactor / 1e6
      };
    }
  },
  
  vacuumBreaker: {
    id: 'vacuumBreaker',
    name: '真空破坏阀',
    category: 'valve',
    description: '管道压力低于大气压时自动开启，引入空气防止负压',
    principle: '防止压力过低导致管道失稳或液柱分离，限制最小压力',
    effectiveness: '完全防止负压，防止液柱分离',
    cost: '低',
    applicableScenarios: ['管道高点', '长距离下坡管道', '泵后管道'],
    parameters: {
      size: { description: '通径', unit: 'mm', defaultValue: 100, min: 25, max: 500 },
      openingPressure: { description: '开启压力（真空度）', unit: 'kPa', defaultValue: 50, min: 10, max: 90 }
    },
    calculatePressureReduction: (params) => {
      const { initialVelocity, waveSpeed } = params;
      const theoreticalMax = initialVelocity * waveSpeed * 1000 / 1e6;
      return {
        reductionFactor: 1,
        expectedPressure: theoreticalMax,
        minPressureGuaranteed: -0.098,
        note: '仅防止负压，不降低正压'
      };
    }
  }
};

const MaterialParameters = {
  steel: { name: '钢管', waveSpeed: 1000, frictionFactor: 0.015, maxPressure: 16 },
  castIron: { name: '铸铁管', waveSpeed: 1200, frictionFactor: 0.02, maxPressure: 4 },
  pvc: { name: 'PVC管', waveSpeed: 400, frictionFactor: 0.01, maxPressure: 2.5 },
  hdpe: { name: 'HDPE管', waveSpeed: 350, frictionFactor: 0.008, maxPressure: 2 },
  concrete: { name: '混凝土管', waveSpeed: 800, frictionFactor: 0.025, maxPressure: 3 }
};

class ProtectionRecommender {
  constructor() {
    this.measures = ProtectionMeasures;
    this.materials = MaterialParameters;
  }
  
  getAllMeasures() {
    return Object.values(this.measures).map(m => ({
      id: m.id,
      name: m.name,
      category: m.category,
      description: m.description,
      effectiveness: m.effectiveness,
      cost: m.cost,
      applicableScenarios: m.applicableScenarios
    }));
  }
  
  getMeasureById(id) {
    return this.measures[id];
  }
  
  getMaterialParameters(materialId) {
    return this.materials[materialId];
  }
  
  analyzeSystemRisk(systemParams) {
    const {
      pipeLength,
      pipeDiameter,
      waveSpeed,
      initialVelocity,
      valveCloseTime,
      staticPressure = 0,
      pipeMaterial = 'steel'
    } = systemParams;
    
    const theoreticalMaxPressure = initialVelocity * waveSpeed * 1000 / 1e6;
    const totalMaxPressure = theoreticalMaxPressure + staticPressure;
    const roundTripTime = 2 * pipeLength / waveSpeed;
    const closeRatio = valveCloseTime / roundTripTime;
    
    const material = this.materials[pipeMaterial] || this.materials.steel;
    const safetyFactor = material.maxPressure / totalMaxPressure;
    
    let riskLevel, riskDescription;
    const absolutePressureRisk = totalMaxPressure > 5 ? 'high' : 
                                 totalMaxPressure > 3 ? 'medium' : 'low';
    
    const safetyFactorRisk = safetyFactor < 1 ? 'critical' :
                             safetyFactor < 1.5 ? 'high' :
                             safetyFactor < 2 ? 'medium' : 'low';
    
    const riskOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    const combinedRiskLevel = Math.max(
      riskOrder[safetyFactorRisk],
      riskOrder[absolutePressureRisk]
    );
    
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    riskLevel = riskLevels[combinedRiskLevel - 1];
    
    if (riskLevel === 'critical') {
      riskDescription = '严重风险：最大压力超过管道承压能力，可能发生爆管';
    } else if (riskLevel === 'high') {
      if (safetyFactor < 1.5) {
        riskDescription = '高风险：压力接近管道设计上限，需要防护措施';
      } else {
        riskDescription = '高风险：绝对压力较高，建议采取防护措施';
      }
    } else if (riskLevel === 'medium') {
      riskDescription = '中等风险：有一定安全余量，建议优化操作';
    } else {
      riskDescription = '低风险：安全裕量充足';
    }
    
    let negativePressureRisk = false;
    if (closeRatio < 1 && theoreticalMaxPressure > staticPressure + 0.1) {
      negativePressureRisk = true;
    }
    
    return {
      theoreticalMaxPressure,
      totalMaxPressure,
      roundTripTime,
      closeRatio,
      safetyFactor,
      riskLevel,
      riskDescription,
      negativePressureRisk,
      materialPressureLimit: material.maxPressure
    };
  }
  
  recommendMeasures(systemParams, constraints = {}) {
    const riskAnalysis = this.analyzeSystemRisk(systemParams);
    const { maxCost, availableSpace, existingMeasures = [] } = constraints;
    
    const recommendations = [];
    const { initialVelocity, waveSpeed, pipeLength, pipeDiameter, staticPressure = 0 } = systemParams;
    
    for (const [id, measure] of Object.entries(this.measures)) {
      if (existingMeasures.includes(id)) continue;
      
      if (maxCost) {
        if (measure.cost === '高' && maxCost === 'low') continue;
        if (measure.cost === '中高' && maxCost === 'low') continue;
      }
      
      const measureParams = { ...systemParams };
      for (const [paramKey, paramDef] of Object.entries(measure.parameters)) {
        measureParams[paramKey] = paramDef.defaultValue;
      }
      
      const effect = measure.calculatePressureReduction(measureParams);
      
      let suitability = 0;
      
      if (effect.expectedPressure < riskAnalysis.materialPressureLimit * 0.8) {
        suitability += 3;
      } else if (effect.expectedPressure < riskAnalysis.materialPressureLimit) {
        suitability += 2;
      }
      
      if (measure.cost === '低') suitability += 2;
      else if (measure.cost === '低中') suitability += 1;
      
      if (riskAnalysis.negativePressureRisk) {
        if (id === 'vacuumBreaker' || id === 'oneWaySurgeTank' || id === 'surgeTank' || id === 'airChamber') {
          suitability += 2;
        }
      }
      
      if (riskAnalysis.closeRatio < 1 && id === 'slowClosingValve') {
        suitability += 2;
      }
      
      if (riskAnalysis.riskLevel === 'critical') {
        if (id === 'surgeTank' || id === 'airChamber' || id === 'pressureReliefValve') {
          suitability += 2;
        }
      }
      
      recommendations.push({
        measure: {
          id: measure.id,
          name: measure.name,
          category: measure.category,
          description: measure.description,
          principle: measure.principle,
          cost: measure.cost,
          effectiveness: measure.effectiveness
        },
        suitability,
        expectedEffect: {
          reductionFactor: effect.reductionFactor,
          expectedPressure: effect.expectedPressure,
          note: effect.note || ''
        },
        suggestedParameters: Object.fromEntries(
          Object.entries(measure.parameters).map(([k, v]) => [k, v.defaultValue])
        )
      });
    }
    
    recommendations.sort((a, b) => b.suitability - a.suitability);
    
    const bestCombination = this.findBestCombination(recommendations, riskAnalysis, systemParams);
    
    return {
      riskAnalysis,
      recommendations: recommendations.slice(0, 6),
      bestCombination,
      systemParams
    };
  }
  
  findBestCombination(recommendations, riskAnalysis, systemParams) {
    const combinations = [
      ['slowClosingValve'],
      ['slowClosingValve', 'pressureReliefValve'],
      ['slowClosingValve', 'airChamber'],
      ['surgeTank'],
      ['surgeTank', 'slowClosingValve'],
      ['airChamber', 'pressureReliefValve'],
      ['slowClosingValve', 'vacuumBreaker'],
      ['bypassPipe', 'pressureReliefValve']
    ];
    
    let bestCombination = null;
    let bestScore = Infinity;
    let bestTotalCost = 0;
    
    const costScore = { '低': 1, '低中': 2, '中': 3, '中高': 4, '高': 5 };
    
    for (const combo of combinations) {
      let totalReduction = 1;
      let totalCost = 0;
      const measures = [];
      
      for (const measureId of combo) {
        const measure = this.measures[measureId];
        if (!measure) continue;
        
        const rec = recommendations.find(r => r.measure.id === measureId);
        if (rec) {
          totalReduction *= rec.expectedEffect.reductionFactor;
          totalCost += costScore[measure.cost] || 3;
          measures.push({
            id: measureId,
            name: measure.name,
            cost: measure.cost
          });
        }
      }
      
      const expectedFinalPressure = riskAnalysis.theoreticalMaxPressure * totalReduction;
      const safetyAfter = riskAnalysis.materialPressureLimit / expectedFinalPressure;
      
      let score = totalCost;
      if (safetyAfter < 1) score += 10;
      else if (safetyAfter < 1.5) score += 5;
      else if (safetyAfter > 3) score += 2;
      
      if (score < bestScore && safetyAfter >= 1.2) {
        bestScore = score;
        bestCombination = {
          measures,
          expectedPressure: expectedFinalPressure,
          safetyFactor: safetyAfter,
          totalCost: Object.keys(costScore).find(k => costScore[k] === Math.ceil(totalCost / measures.length)) || '中'
        };
      }
    }
    
    return bestCombination;
  }
  
  compareMeasures(measureIds, systemParams) {
    const results = [];
    
    for (const id of measureIds) {
      const measure = this.measures[id];
      if (!measure) continue;
      
      const params = { ...systemParams };
      for (const [paramKey, paramDef] of Object.entries(measure.parameters)) {
        params[paramKey] = paramDef.defaultValue;
      }
      
      const effect = measure.calculatePressureReduction(params);
      const baselinePressure = systemParams.initialVelocity * systemParams.waveSpeed * 1000 / 1e6;
      
      results.push({
        id,
        name: measure.name,
        cost: measure.cost,
        baselinePressure,
        pressureWithoutProtection: baselinePressure + (systemParams.staticPressure || 0),
        pressureWithProtection: effect.expectedPressure + (systemParams.staticPressure || 0),
        reductionFactor: effect.reductionFactor,
        pressureReductionPercent: ((1 - effect.reductionFactor) * 100).toFixed(1),
        note: effect.note || ''
      });
    }
    
    return results;
  }
  
  generateProtectionReport(systemParams, constraints = {}) {
    const recommendation = this.recommendMeasures(systemParams, constraints);
    
    const report = {
      title: '水锤防护措施分析报告',
      generatedAt: new Date().toISOString(),
      systemParameters: {
        pipeLength: systemParams.pipeLength,
        pipeDiameter: systemParams.pipeDiameter,
        waveSpeed: systemParams.waveSpeed,
        initialVelocity: systemParams.initialVelocity,
        valveCloseTime: systemParams.valveCloseTime,
        staticPressure: systemParams.staticPressure || 0,
        pipeMaterial: systemParams.pipeMaterial || 'steel'
      },
      riskAssessment: recommendation.riskAnalysis,
      topRecommendations: recommendation.recommendations.map(r => ({
        rank: recommendation.recommendations.indexOf(r) + 1,
        name: r.measure.name,
        suitabilityScore: r.suitability,
        expectedPressure: r.expectedEffect.expectedPressure.toFixed(3),
        reductionPercent: ((1 - r.expectedEffect.reductionFactor) * 100).toFixed(1),
        cost: r.measure.cost
      })),
      optimalCombination: recommendation.bestCombination ? {
        measures: recommendation.bestCombination.measures.map(m => m.name),
        expectedPressure: recommendation.bestCombination.expectedPressure.toFixed(3),
        safetyFactor: recommendation.bestCombination.safetyFactor.toFixed(2),
        estimatedCost: recommendation.bestCombination.totalCost
      } : null,
      conclusions: []
    };
    
    const risk = recommendation.riskAnalysis;
    if (risk.riskLevel === 'critical') {
      report.conclusions.push('紧急：必须立即采取水锤防护措施，管道存在爆管风险');
    } else if (risk.riskLevel === 'high') {
      report.conclusions.push('建议：尽快实施水锤防护措施，提高系统安全性');
    }
    
    if (risk.negativePressureRisk) {
      report.conclusions.push('注意：系统存在负压风险，建议考虑真空破坏阀或调压塔');
    }
    
    if (recommendation.bestCombination) {
      report.conclusions.push(
        `推荐防护方案：${recommendation.bestCombination.measures.map(m => m.name).join(' + ')}，` +
        `预期最大压力：${recommendation.bestCombination.expectedPressure.toFixed(3)} MPa，` +
        `安全系数：${recommendation.bestCombination.safetyFactor.toFixed(2)}`
      );
    }
    
    return report;
  }
}

module.exports = {
  ProtectionMeasures,
  MaterialParameters,
  ProtectionRecommender
};
