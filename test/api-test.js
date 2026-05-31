const http = require('http');
const { WaterHammerSimulation } = require('../public/js/transient-network.js');

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
          resolve({ statusCode: res.statusCode, body: result });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body, error: e.message });
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

async function runAPITests() {
  console.log('='.repeat(60));
  console.log('后端API集成测试');
  console.log('='.repeat(60));
  
  const passed = [];
  const failed = [];
  
  function test(name, fn) {
    try {
      fn();
      passed.push(name);
      console.log(`✓ ${name}`);
    } catch (e) {
      failed.push({ name, error: e.message });
      console.log(`✗ ${name}`);
      console.log(`  错误: ${e.message}`);
    }
  }
  
  let paramId = null;
  let snapshotId = null;
  
  try {
    console.log('\n步骤1: 保存管道参数');
    const paramData = {
      pipeLength: 1000,
      pipeDiameter: 0.5,
      waveSpeed: 1000,
      initialVelocity: 2,
      valveCloseTime: 1,
      density: 1000
    };
    
    const r1 = await makeRequest('POST', '/api/params', paramData);
    console.log(`  响应状态: ${r1.statusCode}`);
    console.log(`  响应内容:`, JSON.stringify(r1.body, null, 2).slice(0, 200));
    
    test('API断言1: 保存参数返回success=true', () => {
      if (!r1.body || typeof r1.body !== 'object') {
        throw new Error(`响应不是JSON对象: ${typeof r1.body}`);
      }
      if (r1.body.success !== true) {
        throw new Error(`success不为true: ${r1.body.success}`);
      }
    });
    
    test('API断言2: 返回有效参数ID', () => {
      if (r1.body.id === undefined || r1.body.id === null) {
        throw new Error(`缺少id字段: ${JSON.stringify(r1.body)}`);
      }
      if (r1.body.id <= 0) {
        throw new Error(`id无效: ${r1.body.id}`);
      }
      paramId = r1.body.id;
    });
    
    console.log(`\n参数ID: ${paramId}`);
    
    console.log('\n步骤2: 运行模拟生成完整快照数据');
    const sim = new WaterHammerSimulation(paramData);
    sim.isRunning = true;
    for (let i = 0; i < 500; i++) {
      sim.step();
    }
    const fullSnapshot = sim.getFullSnapshot();
    console.log(`  模拟完成，当前时间: ${fullSnapshot.time.toFixed(2)}s`);
    console.log(`  pressureDistribution长度: ${fullSnapshot.pressureDistribution.length}`);
    console.log(`  envelope.max长度: ${fullSnapshot.pressureEnvelope.max.length}`);
    
    console.log('\n步骤3: 保存完整快照到后端');
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
    
    const r2 = await makeRequest('POST', '/api/snapshots', snapshotData);
    console.log(`  响应状态: ${r2.statusCode}`);
    console.log(`  响应内容:`, JSON.stringify(r2.body, null, 2).slice(0, 200));
    
    test('API断言3: 保存快照返回success=true', () => {
      if (!r2.body || r2.body.success !== true) {
        throw new Error(`保存快照失败: ${JSON.stringify(r2.body)}`);
      }
    });
    
    test('API断言4: 返回有效快照ID', () => {
      if (!r2.body.id || r2.body.id <= 0) {
        throw new Error(`快照ID无效: ${r2.body.id}`);
      }
      snapshotId = r2.body.id;
    });
    
    console.log(`\n快照ID: ${snapshotId}`);
    
    console.log('\n步骤4: 查询快照数据');
    const r3 = await makeRequest('GET', `/api/snapshots?paramId=${paramId}`);
    console.log(`  响应状态: ${r3.statusCode}`);
    
    test('API断言5: 查询快照返回success=true', () => {
      if (!r3.body || r3.body.success !== true) {
        throw new Error(`查询快照失败`);
      }
    });
    
    test('API断言6: 返回至少1条快照', () => {
      if (!Array.isArray(r3.body.data) || r3.body.data.length === 0) {
        throw new Error(`快照数组为空或不存在`);
      }
    });
    
    const savedSnapshot = r3.body.data[0];
    console.log(`  返回快照数: ${r3.body.data.length}`);
    console.log(`  快照字段:`, Object.keys(savedSnapshot));
    
    test('API断言7: 快照包含pressureDistribution字段', () => {
      if (savedSnapshot.pressureDistribution === undefined || 
          savedSnapshot.pressureDistribution === null) {
        throw new Error('缺少 pressureDistribution 字段');
      }
    });
    
    test('API断言8: pressureDistribution是数组且长度正确', () => {
      const pd = savedSnapshot.pressureDistribution;
      if (!Array.isArray(pd)) {
        throw new Error(`pressureDistribution 不是数组: ${typeof pd}`);
      }
      if (pd.length < 2) {
        throw new Error(`pressureDistribution 长度错误: ${pd.length} < 2`);
      }
    });
    
    test('API断言9: 快照包含完整pressureEnvelope', () => {
      if (!savedSnapshot.pressureEnvelope) {
        throw new Error('缺少 pressureEnvelope 字段');
      }
      if (!savedSnapshot.pressureEnvelope.max) {
        throw new Error('缺少 pressureEnvelope.max');
      }
      if (!savedSnapshot.pressureEnvelope.min) {
        throw new Error('缺少 pressureEnvelope.min');
      }
    });
    
    test('API断言10: pressureEnvelope.max是数组且长度正确', () => {
      const em = savedSnapshot.pressureEnvelope.max;
      if (!Array.isArray(em)) {
        throw new Error(`pressureEnvelope.max 不是数组`);
      }
      if (em.length < 2) {
        throw new Error(`envelope.max 长度错误: ${em.length} < 2`);
      }
    });
    
    test('API断言11: pressureEnvelope.min是数组且长度正确', () => {
      const emi = savedSnapshot.pressureEnvelope.min;
      if (!Array.isArray(emi)) {
        throw new Error(`pressureEnvelope.min 不是数组`);
      }
      if (emi.length < 2) {
        throw new Error(`envelope.min 长度错误: ${emi.length} < 2`);
      }
    });
    
    test('API断言12: 包络线包含有效压力数值', () => {
      const maxVals = savedSnapshot.pressureEnvelope.max;
      const hasValid = maxVals.some(v => typeof v === 'number' && !isNaN(v) && v > 1e5);
      if (!hasValid) {
        throw new Error('压力包络线不包含有效压力值');
      }
    });
    
    test('API断言13: 沿程压力分布与包络线长度一致', () => {
      const pdLen = savedSnapshot.pressureDistribution.length;
      const emLen = savedSnapshot.pressureEnvelope.max.length;
      const emiLen = savedSnapshot.pressureEnvelope.min.length;
      if (pdLen !== emLen || pdLen !== emiLen) {
        throw new Error(`长度不一致: pd=${pdLen}, em=${emLen}, emi=${emiLen}`);
      }
    });
    
    console.log('\n步骤5: 查询包络线分析API');
    const r4 = await makeRequest('GET', `/api/envelope/${paramId}`);
    console.log(`  响应状态: ${r4.statusCode}`);
    console.log(`  响应内容:`, JSON.stringify(r4.body, null, 2).slice(0, 300));
    
    test('API断言14: 包络线分析API返回success=true', () => {
      if (!r4.body || r4.body.success !== true) {
        throw new Error(`包络线分析失败: ${JSON.stringify(r4.body)}`);
      }
    });
    
    if (r4.body && r4.body.data) {
      const envelope = r4.body.data;
      console.log(`  envelope字段:`, Object.keys(envelope));
      
      test('API断言15: 包络线分析包含maxPressure', () => {
        if (envelope.maxPressure === undefined) {
          throw new Error('缺少 maxPressure');
        }
        if (typeof envelope.maxPressure !== 'number') {
          throw new Error(`maxPressure 不是数字: ${typeof envelope.maxPressure}`);
        }
      });
      
      test('API断言16: 包络线分析包含minPressure', () => {
        if (envelope.minPressure === undefined) {
          throw new Error('缺少 minPressure');
        }
      });
      
      test('API断言17: 包络线分析包含envelopeMax数组', () => {
        if (!Array.isArray(envelope.envelopeMax)) {
          throw new Error(`envelopeMax 不是数组: ${typeof envelope.envelopeMax}`);
        }
        if (envelope.envelopeMax.length === 0) {
          throw new Error('envelopeMax 为空');
        }
      });
      
      test('API断言18: 包络线分析包含envelopeMin数组', () => {
        if (!Array.isArray(envelope.envelopeMin)) {
          throw new Error(`envelopeMin 不是数组: ${typeof envelope.envelopeMin}`);
        }
        if (envelope.envelopeMin.length === 0) {
          throw new Error('envelopeMin 为空');
        }
      });
      
      test('API断言19: 包络线最大压力值合理', () => {
        const maxP = envelope.maxPressure;
        if (maxP < 0.1 || maxP > 100) {
          throw new Error(`最大压力值不合理: ${maxP} MPa`);
        }
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('测试汇总');
    console.log('='.repeat(60));
    console.log(`通过: ${passed.length}`);
    console.log(`失败: ${failed.length}`);
    console.log(`总计: ${passed.length + failed.length}`);
    
    if (failed.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('失败用例明细');
      console.log('='.repeat(60));
      failed.forEach((f, i) => {
        console.log(`\n${i + 1}. ${f.name}`);
        console.log(`   错误: ${f.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('数据验证详情');
    console.log('='.repeat(60));
    
    if (r3.body && r3.body.data && r3.body.data[0]) {
      const s = r3.body.data[0];
      console.log('\n沿程压力分布（前5点）:');
      s.pressureDistribution.slice(0, 5).forEach((p, i) => {
        console.log(`  节点${i}: ${(p / 1e6).toFixed(3)} MPa`);
      });
      
      console.log('\n最大压力包络线（前5点）:');
      s.pressureEnvelope.max.slice(0, 5).forEach((p, i) => {
        console.log(`  节点${i}: ${(p / 1e6).toFixed(3)} MPa`);
      });
      
      console.log('\n最小压力包络线（前5点）:');
      s.pressureEnvelope.min.slice(0, 5).forEach((p, i) => {
        console.log(`  节点${i}: ${(p / 1e6).toFixed(3)} MPa`);
      });
    }
    
    process.exit(failed.length === 0 ? 0 : 1);
    
  } catch (error) {
    console.error(`\n测试异常: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runAPITests();
