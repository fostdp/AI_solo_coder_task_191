const { WaterHammerSimulation, ValveCurves, Pipe, Junction } = require('../public/js/transient-network.js');
const assert = require('assert');
const http = require('http');

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
    this.assertions = [];
  }

  test(name, fn) {
    try {
      fn();
      this.passed++;
      this.assertions.push({ name, status: 'PASS' });
      console.log(`✓ ${name}`);
    } catch (error) {
      this.failed++;
      this.failures.push({ name, error: error.message, stack: error.stack });
      this.assertions.push({ name, status: 'FAIL', error: error.message });
      console.log(`✗ ${name}`);
      console.log(`  错误: ${error.message}`);
    }
  }

  summary() {
    console.log('\n' + '='.repeat(60));
    console.log('测试汇总');
    console.log('='.repeat(60));
    console.log(`通过: ${this.passed}`);
    console.log(`失败: ${this.failed}`);
    console.log(`总计: ${this.passed + this.failed}`);
    
    if (this.failures.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('失败用例明细');
      console.log('='.repeat(60));
      this.failures.forEach((f, i) => {
        console.log(`\n${i + 1}. ${f.name}`);
        console.log(`   错误: ${f.error}`);
      });
    }
    
    return this.failed === 0;
  }
}

function runAllTests() {
  const runner = new TestRunner();
  
  console.log('='.repeat(60));
  console.log('水锤压力波模拟 - 功能验证测试');
  console.log('='.repeat(60));
  console.log('\n测试1: 关闭时间变化对最大水锤压力的影响');
  console.log('-'.repeat(60));
  
  testValveCloseTimeEffect(runner);
  
  console.log('\n测试2: 初始流速变化对水锤压力的影响');
  console.log('-'.repeat(60));
  
  testInitialVelocityEffect(runner);
  
  console.log('\n测试3: 后端压力数据完整性验证');
  console.log('-'.repeat(60));
  
  testBackendSnapshotData(runner);
  
  console.log('\n测试4: 管道分支阻抗匹配验证');
  console.log('-'.repeat(60));
  
  testJunctionImpedance(runner);
  
  console.log('\n测试5: 阀门关闭曲线验证');
  console.log('-'.repeat(60));
  
  testValveCurves(runner);
  
  console.log('\n测试6: 压力包络线导出功能验证');
  console.log('-'.repeat(60));
  
  testEnvelopeExport(runner);
  
  return runner.summary();
}

function testValveCloseTimeEffect(runner) {
  const closeTimes = [0.5, 1, 2, 3, 4, 5];
  const results = [];
  
  for (const closeTime of closeTimes) {
    const sim = new WaterHammerSimulation({
      pipeLength: 1000,
      waveSpeed: 1000,
      initialVelocity: 2,
      valveCloseTime: closeTime,
      numNodes: 50
    });
    
    sim.network.isRunning = true;
    const maxSteps = Math.ceil(10 / sim.dt);
    for (let i = 0; i < maxSteps; i++) {
      sim.step();
      if (sim.currentTime > 8) break;
    }
    
    const maxPressure = sim.getMaxPressureMPa();
    const theoreticalMax = sim.theoreticalMaxPressure;
    const roundTripTime = sim.getWaveRoundTripTime();
    const closeRatio = closeTime / roundTripTime;
    
    results.push({
      closeTime,
      closeRatio,
      maxPressure,
      theoreticalMax,
      reductionRatio: maxPressure / theoreticalMax
    });
    
    console.log(`  T_close=${closeTime}s, 关闭比=${closeRatio.toFixed(2)}, ` +
                `P_max=${maxPressure.toFixed(3)}MPa, ` +
                `理论值=${theoreticalMax.toFixed(3)}MPa, ` +
                `比值=${(maxPressure/theoreticalMax).toFixed(3)}`);
  }
  
  for (let i = 0; i < results.length - 1; i++) {
    runner.test(
      `断言1.${i + 1}: 关闭时间 ${results[i].closeTime}s → ${results[i + 1].closeTime}s，压力峰值应降低`,
      () => {
        const currentP = results[i].maxPressure;
        const nextP = results[i + 1].maxPressure;
        const tolerance = 0.02;
        
        if (results[i].closeRatio < 1 && results[i + 1].closeRatio < 1) {
          assert.ok(nextP < currentP * (1 + tolerance), 
            `压力未降低: ${currentP.toFixed(3)} → ${nextP.toFixed(3)} MPa`);
        } else {
          assert.ok(nextP <= currentP * (1 + tolerance),
            `压力未降低: ${currentP.toFixed(3)} → ${nextP.toFixed(3)} MPa`);
        }
      }
    );
  }
  
  runner.test(
    '断言1.7: 关闭时间5s的压力应小于0.5s的70%（缓闭减压效果）',
    () => {
      const fastClose = results[0].maxPressure;
      const slowClose = results[results.length - 1].maxPressure;
      const expectedMaxRatio = 0.7;
      const actualRatio = slowClose / fastClose;
      
      assert.ok(actualRatio < expectedMaxRatio,
        `缓闭减压效果不足: 5s压力/0.5s压力 = ${actualRatio.toFixed(3)}, 应小于 ${expectedMaxRatio}`);
    }
  );
  
  runner.test(
    '断言1.8: 关闭时间0.5s应接近理论最大压力（±30%）',
    () => {
      const fastClose = results[0];
      const ratio = fastClose.maxPressure / fastClose.theoreticalMax;
      
      assert.ok(ratio > 0.7 && ratio < 1.3,
        `快关压力偏离理论值: 实际=${fastClose.maxPressure.toFixed(3)}, ` +
        `理论=${fastClose.theoreticalMax.toFixed(3)}, 比值=${ratio.toFixed(3)}`);
    }
  );
}

function testInitialVelocityEffect(runner) {
  const velocities = [1, 1.5, 2, 2.5, 3];
  const results = [];
  
  for (const velocity of velocities) {
    const sim = new WaterHammerSimulation({
      pipeLength: 1000,
      waveSpeed: 1000,
      initialVelocity: velocity,
      valveCloseTime: 0.5,
      numNodes: 50
    });
    
    sim.network.isRunning = true;
    const maxSteps = Math.ceil(10 / sim.dt);
    for (let i = 0; i < maxSteps; i++) {
      sim.step();
      if (sim.currentTime > 8) break;
    }
    
    const maxPressure = sim.getMaxPressureMPa();
    const theoreticalMax = sim.theoreticalMaxPressure;
    
    results.push({
      velocity,
      maxPressure,
      theoreticalMax,
      linearity: maxPressure / velocity
    });
    
    console.log(`  V0=${velocity}m/s, P_max=${maxPressure.toFixed(3)}MPa, ` +
                `理论值=${theoreticalMax.toFixed(3)}MPa, ` +
                `P/V=${(maxPressure/velocity).toFixed(3)}`);
  }
  
  for (let i = 0; i < results.length - 1; i++) {
    runner.test(
      `断言2.${i + 1}: 流速 ${results[i].velocity} → ${results[i + 1].velocity} m/s，压力应增加`,
      () => {
        const currentP = results[i].maxPressure;
        const nextP = results[i + 1].maxPressure;
        
        assert.ok(nextP > currentP * 1.05,
          `压力未显著增加: ${currentP.toFixed(3)} → ${nextP.toFixed(3)} MPa`);
      }
    );
  }
  
  runner.test(
    '断言2.6: 水锤压力与流速近似线性关系（ΔP ∝ ΔV）',
    () => {
      const linearityValues = results.map(r => r.linearity);
      const avg = linearityValues.reduce((a, b) => a + b, 0) / linearityValues.length;
      const maxDeviation = Math.max(...linearityValues.map(v => Math.abs(v - avg) / avg));
      
      assert.ok(maxDeviation < 0.3,
        `线性关系偏差过大: 平均P/V=${avg.toFixed(3)}, ` +
        `最大偏差=${(maxDeviation * 100).toFixed(1)}%, 应小于30%`);
    }
  );
  
  runner.test(
    '断言2.7: 流速3m/s的压力应约为1m/s的3倍（±40%）',
    () => {
      const p1 = results[0].maxPressure;
      const p3 = results[results.length - 1].maxPressure;
      const ratio = p3 / p1;
      
      assert.ok(ratio > 1.8 && ratio < 4.2,
        `3m/s压力/1m/s压力 = ${ratio.toFixed(2)}, 应在1.8-4.2之间`);
    }
  );
}

function testBackendSnapshotData(runner) {
  const sim = new WaterHammerSimulation({
    pipeLength: 1000,
    waveSpeed: 1000,
    initialVelocity: 2,
    valveCloseTime: 1,
    numNodes: 50
  });
  
  sim.network.isRunning = true;
  for (let i = 0; i < 200; i++) {
    sim.step();
  }
  
  const snapshot = sim.getFullSnapshot();
  
  console.log('  快照数据结构检查:');
  console.log(`    - time: ${snapshot.time.toFixed(3)}s`);
  console.log(`    - maxPressure: ${snapshot.maxPressure.toFixed(3)} MPa`);
  console.log(`    - minPressure: ${snapshot.minPressure.toFixed(3)} MPa`);
  console.log(`    - valveOpening: ${(snapshot.valveOpening * 100).toFixed(0)}%`);
  console.log(`    - pressureDistribution长度: ${snapshot.pressureDistribution.length}`);
  console.log(`    - velocityDistribution长度: ${snapshot.velocityDistribution.length}`);
  console.log(`    - envelope.max长度: ${snapshot.pressureEnvelope.max.length}`);
  console.log(`    - envelope.min长度: ${snapshot.pressureEnvelope.min.length}`);
  
  runner.test(
    '断言3.1: 快照包含pressureDistribution（沿程压力分布）',
    () => {
      assert.ok(snapshot.pressureDistribution, 
        '缺少 pressureDistribution 字段');
      assert.ok(Array.isArray(snapshot.pressureDistribution),
        'pressureDistribution 不是数组');
      assert.strictEqual(snapshot.pressureDistribution.length, sim.numNodes,
        `pressureDistribution 长度错误: ${snapshot.pressureDistribution.length} ≠ ${sim.numNodes}`);
    }
  );
  
  runner.test(
    '断言3.2: 快照包含velocityDistribution（沿程流速分布）',
    () => {
      assert.ok(snapshot.velocityDistribution,
        '缺少 velocityDistribution 字段');
      assert.ok(Array.isArray(snapshot.velocityDistribution),
        'velocityDistribution 不是数组');
      assert.strictEqual(snapshot.velocityDistribution.length, sim.numNodes,
        `velocityDistribution 长度错误: ${snapshot.velocityDistribution.length} ≠ ${sim.numNodes}`);
    }
  );
  
  runner.test(
    '断言3.3: 快照包含pressureEnvelope.max（最大压力包络线）',
    () => {
      assert.ok(snapshot.pressureEnvelope,
        '缺少 pressureEnvelope 字段');
      assert.ok(snapshot.pressureEnvelope.max,
        '缺少 pressureEnvelope.max 字段');
      assert.ok(Array.isArray(snapshot.pressureEnvelope.max),
        'pressureEnvelope.max 不是数组');
      assert.strictEqual(snapshot.pressureEnvelope.max.length, sim.numNodes,
        `envelope.max 长度错误: ${snapshot.pressureEnvelope.max.length} ≠ ${sim.numNodes}`);
    }
  );
  
  runner.test(
    '断言3.4: 快照包含pressureEnvelope.min（最小压力包络线）',
    () => {
      assert.ok(snapshot.pressureEnvelope.min,
        '缺少 pressureEnvelope.min 字段');
      assert.ok(Array.isArray(snapshot.pressureEnvelope.min),
        'pressureEnvelope.min 不是数组');
      assert.strictEqual(snapshot.pressureEnvelope.min.length, sim.numNodes,
        `envelope.min 长度错误: ${snapshot.pressureEnvelope.min.length} ≠ ${sim.numNodes}`);
    }
  );
  
  runner.test(
    '断言3.5: 压力包络线最大值 ≥ 当前沿程压力最大值',
    () => {
      const currentMax = Math.max(...snapshot.pressureDistribution);
      const envelopeMax = Math.max(...snapshot.pressureEnvelope.max);
      
      assert.ok(envelopeMax >= currentMax - 0.01,
        `包络线最大值 < 当前最大值: ${(envelopeMax/1e6).toFixed(3)} < ${(currentMax/1e6).toFixed(3)} MPa`);
    }
  );
  
  runner.test(
    '断言3.6: 压力包络线最小值 ≤ 当前沿程压力最小值',
    () => {
      const currentMin = Math.min(...snapshot.pressureDistribution);
      const envelopeMin = Math.min(...snapshot.pressureEnvelope.min);
      
      assert.ok(envelopeMin <= currentMin + 0.01,
        `包络线最小值 > 当前最小值: ${(envelopeMin/1e6).toFixed(3)} > ${(currentMin/1e6).toFixed(3)} MPa`);
    }
  );
  
  runner.test(
    '断言3.7: 包络线数据包含非零值（模拟运行后应产生压力变化）',
    () => {
      const hasSignificantValues = snapshot.pressureEnvelope.max.some(p => Math.abs(p) > 1e5);
      assert.ok(hasSignificantValues,
        '压力包络线全为零或接近零，可能未正确记录');
    }
  );
  
  runner.test(
    '断言3.8: 沿程压力分布包含合理的压力值（非NaN、非无穷大）',
    () => {
      const allValid = snapshot.pressureDistribution.every(p => 
        !isNaN(p) && isFinite(p) && Math.abs(p) < 1e8
      );
      assert.ok(allValid,
        '沿程压力分布包含无效值（NaN、Infinity或超出范围）');
    }
  );
}

function testJunctionImpedance(runner) {
  const sim = new WaterHammerSimulation({
    pipeLength: 1000,
    pipeDiameter: 0.5,
    waveSpeed: 1000,
    numNodes: 50
  });
  
  const mainPipe = { diameter: 0.5, waveSpeed: 1000 };
  
  const testCases = [
    {
      name: '等直径分支（完全匹配）',
      branches: [{ diameter: 0.5, waveSpeed: 1000 }],
      expectedR: 0,
      expectedT: 1
    },
    {
      name: '支管直径减半（阻抗增大）',
      branches: [{ diameter: 0.25, waveSpeed: 1000 }],
      expectedR: 0.6,
      expectedT: 1.6
    },
    {
      name: '双支管（并联阻抗减小）',
      branches: [
        { diameter: 0.5, waveSpeed: 1000 },
        { diameter: 0.5, waveSpeed: 1000 }
      ],
      expectedR: -0.333,
      expectedT: 0.667
    }
  ];
  
  for (const tc of testCases) {
    const result = sim.calculateJunctionImpedance(mainPipe, tc.branches);
    
    console.log(`  ${tc.name}:`);
    console.log(`    Z_main=${result.Z_main.toExponential(2)}, ` +
                `Z_branches=${result.Z_branches.toExponential(2)}`);
    console.log(`    反射系数 R=${result.reflectionCoefficient.toFixed(3)} ` +
                `(预期≈${tc.expectedR.toFixed(3)})`);
    console.log(`    透射系数 T=${result.transmissionCoefficient.toFixed(3)} ` +
                `(预期≈${tc.expectedT.toFixed(3)})`);
    
    runner.test(
      `断言4.${testCases.indexOf(tc) * 2 + 1}: ${tc.name} - 反射系数`,
      () => {
        const tolerance = 0.1;
        assert.ok(
          Math.abs(result.reflectionCoefficient - tc.expectedR) < tolerance,
          `反射系数错误: ${result.reflectionCoefficient.toFixed(3)} ≈ ${tc.expectedR.toFixed(3)} ±${tolerance}`
        );
      }
    );
    
    runner.test(
      `断言4.${testCases.indexOf(tc) * 2 + 2}: ${tc.name} - 透射系数`,
      () => {
        const tolerance = 0.1;
        assert.ok(
          Math.abs(result.transmissionCoefficient - tc.expectedT) < tolerance,
          `透射系数错误: ${result.transmissionCoefficient.toFixed(3)} ≈ ${tc.expectedT.toFixed(3)} ±${tolerance}`
        );
      }
    );
  }
  
  runner.test(
    '断言4.7: 能量守恒验证 (T - R = 1)',
    () => {
      const result = sim.calculateJunctionImpedance(mainPipe, testCases[0].branches);
      const relation = result.transmissionCoefficient - result.reflectionCoefficient;
      assert.ok(
        Math.abs(relation - 1) < 0.01,
        `能量关系不成立: T - R = ${relation.toFixed(4)} ≠ 1`
      );
    }
  );
}

function testValveCurves(runner) {
  console.log('  阀门关闭曲线类型:', Object.keys(ValveCurves));
  
  const curveTestCases = [
    { name: 'linear', desc: '线性关闭', timePoints: [0, 0.5, 1] },
    { name: 'fastClose', desc: '快关（30%时间内完成）', timePoints: [0, 0.15, 0.3, 0.5] },
    { name: 'slowClose', desc: '缓闭（指数衰减）', timePoints: [0, 0.5, 1, 2] },
    { name: 'parabolic', desc: '抛物线关闭', timePoints: [0, 0.5, 1] },
    { name: 'twoStage', desc: '两阶段关闭', timePoints: [0, 0.25, 0.5, 0.75, 1] },
    { name: 'optimized', desc: '优化关闭', timePoints: [0, 0.1, 0.5, 0.9, 1.1] }
  ];
  
  let testIndex = 0;
  for (const tc of curveTestCases) {
    const curveFn = ValveCurves[tc.name];
    if (!curveFn) continue;
    
    console.log(`\n  ${tc.desc} (${tc.name}):`);
    const T = 1;
    tc.timePoints.forEach(t => {
      const opening = curveFn(t, T);
      console.log(`    t=${t}T: 开度=${(opening * 100).toFixed(1)}%`);
    });
    
    runner.test(
      `断言5.${testIndex++}: ${tc.desc} - t=0时开度为1`,
      () => {
        const opening = curveFn(0, T);
        assert.strictEqual(opening, 1, `t=0时开度应为1，实际为${opening}`);
      }
    );
    
    runner.test(
      `断言5.${testIndex++}: ${tc.desc} - t>=T时开度为0`,
      () => {
        const opening = curveFn(T + 0.1, T);
        assert.strictEqual(opening, 0, `t>=T时开度应为0，实际为${opening}`);
      }
    );
    
    runner.test(
      `断言5.${testIndex++}: ${tc.desc} - 开度单调递减`,
      () => {
        let prevOpening = 1;
        for (let t = 0; t <= T; t += 0.01) {
          const opening = curveFn(t, T);
          assert.ok(opening <= prevOpening + 1e-10, 
            `开度非单调递减: t=${t}, ${prevOpening.toFixed(4)} → ${opening.toFixed(4)}`);
          prevOpening = opening;
        }
      }
    );
  }
  
  runner.test(
    '断言5.25: 不同关闭曲线产生不同压力峰值',
    () => {
      const curves = ['linear', 'fastClose', 'slowClose'];
      const pressures = [];
      
      for (const curve of curves) {
        const sim = new WaterHammerSimulation({
          pipeLength: 1000,
          waveSpeed: 1000,
          initialVelocity: 2,
          valveCloseTime: 2,
          valveCurve: curve,
          numNodes: 50
        });
        
        sim.network.isRunning = true;
        for (let i = 0; i < 300; i++) {
          sim.step();
        }
        pressures.push(sim.getMaxPressureMPa());
      }
      
      console.log(`\n  不同曲线压力峰值:`);
      curves.forEach((c, i) => console.log(`    ${c}: ${pressures[i].toFixed(3)} MPa`));
      
      const fastCloseP = pressures[1];
      const slowCloseP = pressures[2];
      assert.ok(slowCloseP < fastCloseP,
        `缓闭压力应小于快关: ${slowCloseP.toFixed(3)} < ${fastCloseP.toFixed(3)}`);
    }
  );
}

function testEnvelopeExport(runner) {
  const sim = new WaterHammerSimulation({
    pipeLength: 1000,
    waveSpeed: 1000,
    initialVelocity: 2,
    valveCloseTime: 1,
    numNodes: 50
  });
  
  sim.network.isRunning = true;
  for (let i = 0; i < 200; i++) {
    sim.step();
  }
  
  const snapshot = sim.getFullSnapshot();
  const envelopeData = snapshot.envelopeData;
  
  console.log('  包络线导出数据检查:');
  console.log(`    - globalMax: ${envelopeData.globalMax.toFixed(3)} MPa`);
  console.log(`    - globalMin: ${envelopeData.globalMin.toFixed(3)} MPa`);
  console.log(`    - 包含管道数: ${Object.keys(envelopeData.pipes).length}`);
  console.log(`    - 时间戳: ${envelopeData.timestamp}`);
  
  runner.test(
    '断言6.1: 导出数据包含globalMax和globalMin',
    () => {
      assert.ok(envelopeData.globalMax !== undefined, '缺少 globalMax');
      assert.ok(envelopeData.globalMin !== undefined, '缺少 globalMin');
      assert.ok(typeof envelopeData.globalMax === 'number', 'globalMax 不是数字');
    }
  );
  
  runner.test(
    '断言6.2: 导出数据包含pipes对象',
    () => {
      assert.ok(envelopeData.pipes, '缺少 pipes 字段');
      assert.ok(typeof envelopeData.pipes === 'object', 'pipes 不是对象');
      assert.ok(Object.keys(envelopeData.pipes).length > 0, 'pipes 为空');
    }
  );
  
  runner.test(
    '断言6.3: 每个管道包络线包含positions、max、min',
    () => {
      const pipeEnvelope = Object.values(envelopeData.pipes)[0];
      assert.ok(pipeEnvelope.positions, '缺少 positions');
      assert.ok(pipeEnvelope.max, '缺少 max');
      assert.ok(pipeEnvelope.min, '缺少 min');
      assert.ok(Array.isArray(pipeEnvelope.positions), 'positions 不是数组');
    }
  );
  
  runner.test(
    '断言6.4: 包络线数据长度一致',
    () => {
      const pipeEnvelope = Object.values(envelopeData.pipes)[0];
      assert.strictEqual(
        pipeEnvelope.positions.length,
        pipeEnvelope.max.length,
        'positions 与 max 长度不一致'
      );
      assert.strictEqual(
        pipeEnvelope.positions.length,
        pipeEnvelope.min.length,
        'positions 与 min 长度不一致'
      );
    }
  );
  
  runner.test(
    '断言6.5: 包络线包含有效时间戳',
    () => {
      assert.ok(envelopeData.timestamp, '缺少 timestamp');
      assert.ok(new Date(envelopeData.timestamp).isValid || !isNaN(Date.parse(envelopeData.timestamp)),
        '时间戳无效');
    }
  );
}

async function testBackendAPI() {
  console.log('\n' + '='.repeat(60));
  console.log('后端API集成测试');
  console.log('='.repeat(60));
  
  const runner = new TestRunner();
  
  try {
    const paramData = {
      pipeLength: 1000,
      pipeDiameter: 0.5,
      waveSpeed: 1000,
      initialVelocity: 2,
      valveCloseTime: 1,
      density: 1000
    };
    
    console.log('\n步骤1: 保存管道参数');
    const paramId = await apiRequest('POST', '/api/params', paramData);
    console.log(`  已保存参数，ID: ${paramId}`);
    
    runner.test(
      'API断言1: 保存参数返回有效ID',
      () => {
        assert.ok(paramId > 0, `参数ID无效: ${paramId}`);
      }
    );
    
    console.log('\n步骤2: 运行模拟生成数据');
    const sim = new WaterHammerSimulation(paramData);
    sim.isRunning = true;
    for (let i = 0; i < 500; i++) {
      sim.step();
    }
    const fullSnapshot = sim.getFullSnapshot();
    
    console.log('\n步骤3: 保存完整快照');
    const snapshotData = {
      paramId: paramId,
      time: fullSnapshot.time,
      maxPressure: fullSnapshot.maxPressure,
      minPressure: fullSnapshot.minPressure,
      valveOpening: fullSnapshot.valveOpening,
      pressureDistribution: fullSnapshot.pressureDistribution,
      velocityDistribution: fullSnapshot.velocityDistribution,
      pressureEnvelope: fullSnapshot.pressureEnvelope
    };
    
    const snapshotId = await apiRequest('POST', '/api/snapshots', snapshotData);
    console.log(`  已保存快照，ID: ${snapshotId}`);
    
    runner.test(
      'API断言2: 保存快照返回有效ID',
      () => {
        assert.ok(snapshotId > 0, `快照ID无效: ${snapshotId}`);
      }
    );
    
    console.log('\n步骤4: 查询快照数据');
    const snapshots = await apiRequest('GET', `/api/snapshots?paramId=${paramId}`);
    console.log(`  查询到 ${snapshots.length} 条快照`);
    
    if (snapshots.length > 0) {
      const savedSnapshot = snapshots[0];
      console.log('  检查返回的快照数据:');
      console.log(`    - pressureDistribution: ${savedSnapshot.pressureDistribution?.length || '缺失'} 个点`);
      console.log(`    - pressureEnvelope.max: ${savedSnapshot.pressureEnvelope?.max?.length || '缺失'} 个点`);
      console.log(`    - pressureEnvelope.min: ${savedSnapshot.pressureEnvelope?.min?.length || '缺失'} 个点`);
      
      runner.test(
        'API断言3: 后端返回的快照包含pressureDistribution',
        () => {
          assert.ok(savedSnapshot.pressureDistribution,
            '后端返回的快照缺少 pressureDistribution');
          assert.ok(Array.isArray(savedSnapshot.pressureDistribution),
            'pressureDistribution 不是数组');
          assert.ok(savedSnapshot.pressureDistribution.length > 0,
            'pressureDistribution 为空数组');
        }
      );
      
      runner.test(
        'API断言4: 后端返回的快照包含完整压力包络线',
        () => {
          assert.ok(savedSnapshot.pressureEnvelope,
            '后端返回的快照缺少 pressureEnvelope');
          assert.ok(savedSnapshot.pressureEnvelope.max,
            '缺少 pressureEnvelope.max');
          assert.ok(savedSnapshot.pressureEnvelope.min,
            '缺少 pressureEnvelope.min');
          assert.ok(Array.isArray(savedSnapshot.pressureEnvelope.max),
            'pressureEnvelope.max 不是数组');
          assert.ok(Array.isArray(savedSnapshot.pressureEnvelope.min),
            'pressureEnvelope.min 不是数组');
        }
      );
      
      runner.test(
        'API断言5: 包络线数据长度与节点数一致',
        () => {
          assert.strictEqual(
            savedSnapshot.pressureEnvelope.max.length,
            savedSnapshot.pressureDistribution.length,
            `包络线长度与压力分布长度不一致`
          );
        }
      );
    }
    
    console.log('\n步骤5: 查询包络线分析API');
    const envelope = await apiRequest('GET', `/api/envelope/${paramId}`);
    if (envelope) {
      console.log(`  包络线分析 - 最大压力: ${envelope.maxPressure.toFixed(3)} MPa, ` +
                  `最小压力: ${envelope.minPressure.toFixed(3)} MPa`);
      
      runner.test(
        'API断言6: 包络线分析API返回有效数据',
        () => {
          assert.ok(envelope.maxPressure !== undefined,
            '缺少 maxPressure');
          assert.ok(envelope.minPressure !== undefined,
            '缺少 minPressure');
          assert.ok(Array.isArray(envelope.envelopeMax),
            'envelopeMax 不是数组');
          assert.ok(Array.isArray(envelope.envelopeMin),
            'envelopeMin 不是数组');
        }
      );
    }
    
  } catch (error) {
    console.log(`  API测试跳过: ${error.message}`);
    console.log('  请确保后端服务器运行在 http://localhost:3000');
  }
  
  runner.summary();
}

function apiRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.success) {
            resolve(result.data !== undefined ? result.data : result.id);
          } else {
            reject(new Error(result.error || 'API请求失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

console.clear();
const unitTestsPassed = runAllTests();

testBackendAPI().then(() => {
  process.exit(unitTestsPassed ? 0 : 1);
}).catch(() => {
  process.exit(unitTestsPassed ? 0 : 1);
});
