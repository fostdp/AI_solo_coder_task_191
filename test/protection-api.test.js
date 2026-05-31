const assert = require('assert');
const http = require('http');

const BASE_PATH = '/api/protection';

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData ? Buffer.byteLength(postData) : 0
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          reject(new Error('JSON解析失败: ' + e.message));
        }
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

const testSystem = {
  pipeLength: 1000,
  pipeDiameter: 0.5,
  waveSpeed: 1000,
  initialVelocity: 2,
  valveCloseTime: 0.5,
  staticPressure: 0.2,
  pipeMaterial: 'steel'
};

async function runTests() {
  console.log('\n水锤防护措施 API 集成测试');
  console.log('='.repeat(60));
  
  let passCount = 0;
  let failCount = 0;
  
  function test(description, fn) {
    try {
      fn();
      console.log(`✓ ${description}`);
      passCount++;
    } catch (error) {
      console.log(`✗ ${description}`);
      console.log(`  错误: ${error.message}`);
      failCount++;
    }
  }
  
  try {
    console.log('\n测试1: 风险分析 API');
    console.log('-' * 60);
    
    const riskResult = await makeRequest('POST', `${BASE_PATH}/analyze-risk`, testSystem);
    
    test('风险分析请求成功', () => {
      assert.ok(riskResult.success, 'API 调用失败');
    });
    
    test('返回数据包含风险等级', () => {
      assert.ok(riskResult.data.riskLevel, '缺少 riskLevel');
    });
    
    test('返回数据包含理论最大压力', () => {
      assert.ok(riskResult.data.theoreticalMaxPressure !== undefined, '缺少 theoreticalMaxPressure');
      assert.ok(typeof riskResult.data.theoreticalMaxPressure === 'number', 'theoreticalMaxPressure 不是数字');
    });
    
    test('返回数据包含安全系数', () => {
      assert.ok(riskResult.data.safetyFactor !== undefined, '缺少 safetyFactor');
    });
    
    test('返回数据包含负压风险标识', () => {
      assert.ok(riskResult.data.negativePressureRisk !== undefined, '缺少 negativePressureRisk');
    });
    
    test('风险等级为 valid 值', () => {
      const validLevels = ['critical', 'high', 'medium', 'low'];
      assert.ok(validLevels.includes(riskResult.data.riskLevel), `无效的风险等级: ${riskResult.data.riskLevel}`);
    });
    
    const expectedMaxPressure = testSystem.initialVelocity * testSystem.waveSpeed * 1000 / 1e6;
    test('理论最大压力计算正确', () => {
      assert.ok(
        Math.abs(riskResult.data.theoreticalMaxPressure - expectedMaxPressure) < 0.01,
        `理论最大压力错误: 预期 ${expectedMaxPressure}, 实际 ${riskResult.data.theoreticalMaxPressure}`
      );
    });
    
    console.log('\n  详细结果:');
    console.log(`    风险等级: ${riskResult.data.riskLevel}`);
    console.log(`    描述: ${riskResult.data.riskDescription}`);
    console.log(`    理论最大压力: ${riskResult.data.theoreticalMaxPressure.toFixed(3)} MPa`);
    console.log(`    总最大压力: ${riskResult.data.totalMaxPressure.toFixed(3)} MPa`);
    console.log(`    安全系数: ${riskResult.data.safetyFactor.toFixed(2)}`);
    console.log(`    负压风险: ${riskResult.data.negativePressureRisk}`);
    
    console.log('\n测试2: 措施推荐 API');
    console.log('-' * 60);
    
    const recResult = await makeRequest('POST', `${BASE_PATH}/recommend`, {
      systemParams: testSystem,
      constraints: { maxCost: 'medium' }
    });
    
    test('推荐请求成功', () => {
      assert.ok(recResult.success, 'API 调用失败');
    });
    
    test('返回推荐措施列表', () => {
      assert.ok(Array.isArray(recResult.data.recommendations), 'recommendations 不是数组');
      assert.ok(recResult.data.recommendations.length > 0, '推荐列表为空');
    });
    
    test('每个推荐包含适配度分数', () => {
      recResult.data.recommendations.forEach((rec, i) => {
        assert.ok(rec.suitability !== undefined, `推荐 ${i} 缺少 suitability`);
      });
    });
    
    test('每个推荐包含预期效果', () => {
      recResult.data.recommendations.forEach((rec, i) => {
        assert.ok(rec.expectedEffect, `推荐 ${i} 缺少 expectedEffect`);
        assert.ok(rec.expectedEffect.expectedPressure !== undefined, `推荐 ${i} 缺少 expectedPressure`);
      });
    });
    
    test('推荐按适配度降序排列', () => {
      for (let i = 1; i < recResult.data.recommendations.length; i++) {
        assert.ok(
          recResult.data.recommendations[i].suitability <= recResult.data.recommendations[i-1].suitability,
          `推荐未按适配度降序排列`
        );
      }
    });
    
    test('包含最优组合推荐', () => {
      assert.ok(recResult.data.bestCombination, '缺少 bestCombination');
    });
    
    console.log('\n  前3个推荐措施:');
    recResult.data.recommendations.slice(0, 3).forEach((rec, i) => {
      console.log(`    ${i+1}. ${rec.measure.name} - 适配度: ${rec.suitability} - 预期压力: ${rec.expectedEffect.expectedPressure.toFixed(3)} MPa`);
    });
    
    if (recResult.data.bestCombination) {
      console.log('\n  最优组合方案:');
      console.log(`    措施: ${recResult.data.bestCombination.measures.map(m => m.name).join(' + ')}`);
      console.log(`    预期压力: ${recResult.data.bestCombination.expectedPressure.toFixed(3)} MPa`);
      console.log(`    安全系数: ${recResult.data.bestCombination.safetyFactor.toFixed(2)}`);
      console.log(`    预估成本: ${recResult.data.bestCombination.totalCost}`);
    }
    
    console.log('\n测试3: 措施对比 API');
    console.log('-' * 60);
    
    const compResult = await makeRequest('POST', `${BASE_PATH}/compare`, {
      measureIds: ['slowClosingValve', 'surgeTank', 'airChamber', 'pressureReliefValve'],
      systemParams: testSystem
    });
    
    test('对比请求成功', () => {
      assert.ok(compResult.success, 'API 调用失败');
    });
    
    test('返回对比结果数组', () => {
      assert.ok(Array.isArray(compResult.data), '返回数据不是数组');
      assert.strictEqual(compResult.data.length, 4, '对比结果数量不正确');
    });
    
    test('每个对比项包含压力降低百分比', () => {
      compResult.data.forEach((item, i) => {
        assert.ok(item.pressureReductionPercent !== undefined, `对比项 ${i} 缺少 pressureReductionPercent`);
      });
    });
    
    test('防护后压力低于无防护压力', () => {
      compResult.data.forEach((item, i) => {
        assert.ok(
          item.pressureWithProtection < item.pressureWithoutProtection,
          `对比项 ${i}: 防护后压力 (${item.pressureWithProtection}) 不低于无防护压力 (${item.pressureWithoutProtection})`
        );
      });
    });
    
    console.log('\n  对比结果:');
    compResult.data.forEach(item => {
      console.log(`    ${item.name}: ${item.pressureReductionPercent}% 减压 - 成本: ${item.cost}`);
    });
    
    console.log('\n测试4: 报告生成 API');
    console.log('-' * 60);
    
    const reportResult = await makeRequest('POST', `${BASE_PATH}/report`, {
      systemParams: testSystem,
      constraints: { maxCost: 'medium' }
    });
    
    test('报告生成成功', () => {
      assert.ok(reportResult.success, 'API 调用失败');
    });
    
    test('报告包含标题', () => {
      assert.ok(reportResult.data.title, '缺少 title');
    });
    
    test('报告包含系统参数', () => {
      assert.ok(reportResult.data.systemParameters, '缺少 systemParameters');
      assert.strictEqual(reportResult.data.systemParameters.pipeLength, testSystem.pipeLength);
    });
    
    test('报告包含风险评估', () => {
      assert.ok(reportResult.data.riskAssessment, '缺少 riskAssessment');
    });
    
    test('报告包含推荐措施列表', () => {
      assert.ok(Array.isArray(reportResult.data.topRecommendations), 'topRecommendations 不是数组');
      assert.ok(reportResult.data.topRecommendations.length > 0, '推荐列表为空');
    });
    
    test('报告包含结论与建议', () => {
      assert.ok(Array.isArray(reportResult.data.conclusions), 'conclusions 不是数组');
      assert.ok(reportResult.data.conclusions.length > 0, '结论列表为空');
    });
    
    test('报告包含时间戳', () => {
      assert.ok(reportResult.data.generatedAt, '缺少 generatedAt');
    });
    
    console.log('\n  报告概览:');
    console.log(`    标题: ${reportResult.data.title}`);
    console.log(`    生成时间: ${new Date(reportResult.data.generatedAt).toLocaleString('zh-CN')}`);
    console.log(`    风险等级: ${reportResult.data.riskAssessment.riskLevel}`);
    console.log(`    推荐措施数: ${reportResult.data.topRecommendations.length}`);
    console.log(`    结论条数: ${reportResult.data.conclusions.length}`);
    
    console.log('\n测试5: 不同风险场景测试');
    console.log('-' * 60);
    
    const lowRiskSystem = { ...testSystem, initialVelocity: 0.5, valveCloseTime: 5 };
    const lowRiskResult = await makeRequest('POST', `${BASE_PATH}/analyze-risk`, lowRiskSystem);
    
    test('低风险场景识别正确', () => {
      assert.ok(
        lowRiskResult.data.riskLevel === 'low' || lowRiskResult.data.riskLevel === 'medium',
        `低风险场景错误识别为 ${lowRiskResult.data.riskLevel}`
      );
    });
    
    console.log(`  低风险场景: 风险等级=${lowRiskResult.data.riskLevel}, 安全系数=${lowRiskResult.data.safetyFactor.toFixed(2)}`);
    
    const highRiskSystem = { ...testSystem, initialVelocity: 6, valveCloseTime: 0.1 };
    const highRiskResult = await makeRequest('POST', `${BASE_PATH}/analyze-risk`, highRiskSystem);
    
    test('高风险场景识别正确', () => {
      assert.ok(
        highRiskResult.data.riskLevel === 'critical' || highRiskResult.data.riskLevel === 'high',
        `高风险场景错误识别为 ${highRiskResult.data.riskLevel}`
      );
    });
    
    console.log(`  高风险场景: 风险等级=${highRiskResult.data.riskLevel}, 安全系数=${highRiskResult.data.safetyFactor.toFixed(2)}`);
    
    const pvcSystem = { ...testSystem, pipeMaterial: 'pvc', initialVelocity: 3 };
    const pvcResult = await makeRequest('POST', `${BASE_PATH}/analyze-risk`, pvcSystem);
    
    const steelResult = await makeRequest('POST', `${BASE_PATH}/analyze-risk`, { ...pvcSystem, pipeMaterial: 'steel' });
    
    test('PVC管（低承压）风险等级更高', () => {
      const riskOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      assert.ok(
        riskOrder[pvcResult.data.riskLevel] >= riskOrder[steelResult.data.riskLevel],
        `PVC管风险 (${pvcResult.data.riskLevel}) 不应低于钢管风险 (${steelResult.data.riskLevel})`
      );
    });
    
    console.log(`  PVC管场景: 风险等级=${pvcResult.data.riskLevel}, 安全系数=${pvcResult.data.safetyFactor.toFixed(2)}`);
    
  } catch (error) {
    console.log('\n测试执行出错:', error.message);
    console.log(error.stack);
    failCount++;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('测试汇总');
  console.log('='.repeat(60));
  console.log(`通过: ${passCount}`);
  console.log(`失败: ${failCount}`);
  console.log(`总计: ${passCount + failCount}`);
  
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
