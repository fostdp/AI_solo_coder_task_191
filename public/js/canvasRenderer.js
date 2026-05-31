class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    
    this.pipeY = this.height * 0.7;
    this.pipeHeight = 70;
    this.pipeStartX = 100;
    this.pipeEndX = this.width - 100;
    this.pipeLength = this.pipeEndX - this.pipeStartX;
    
    this.graphTop = 40;
    this.graphHeight = 220;
    this.graphBottom = this.graphTop + this.graphHeight;
    
    this.maxPressureDisplay = 5;
    this.waveHistory = [];
    this.maxHistoryLength = 8;
    
    this.waveParticles = [];
    this.flowParticles = [];
    
    this.showEnvelope = true;
    this.showVelocityProfile = false;
    this.show3DPipe = true;
    this.showPressureGradient = true;
    
    this.comparisonWaves = [];
    this.comparisonColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181'];
    
    this.animationFrame = 0;
    this.timeOffset = 0;
  }
  
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    
    this.pipeY = this.height * 0.68;
    this.pipeEndX = this.width - 100;
    this.pipeLength = this.pipeEndX - this.pipeStartX;
    this.graphBottom = this.graphTop + this.graphHeight;
  }
  
  addComparisonWave(name, pressureData, color) {
    this.comparisonWaves.push({
      name,
      data: pressureData,
      color: color || this.comparisonColors[this.comparisonWaves.length % this.comparisonColors.length]
    });
  }
  
  clearComparisonWaves() {
    this.comparisonWaves = [];
  }
  
  clear() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.5, '#0d1525');
    gradient.addColorStop(1, '#050810');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    this.drawStarfield();
    this.drawGrid();
  }
  
  drawStarfield() {
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 50; i++) {
      const x = (i * 37) % this.width;
      const y = (i * 23) % (this.graphTop - 20);
      const size = (i % 3) * 0.5 + 0.5;
      const twinkle = Math.sin(this.animationFrame * 0.02 + i) * 0.5 + 0.5;
      this.ctx.globalAlpha = twinkle * 0.5;
      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }
  
  drawGrid() {
    this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
    this.ctx.lineWidth = 1;
    
    for (let x = this.pipeStartX; x <= this.pipeEndX; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, this.graphTop);
      this.ctx.lineTo(x, this.graphBottom);
      this.ctx.stroke();
    }
    
    for (let y = this.graphTop; y <= this.graphBottom; y += 44) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.pipeStartX, y);
      this.ctx.lineTo(this.pipeEndX, y);
      this.ctx.stroke();
    }
    
    this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(this.pipeStartX, this.graphTop, this.pipeLength, this.graphHeight);
  }
  
  drawPressureGraph(simulation, time) {
    const pressureData = simulation.getPressureData();
    const numPoints = pressureData.x.length;
    
    this.ctx.save();
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.pipeStartX, this.graphTop + this.graphHeight / 2);
    this.ctx.lineTo(this.pipeEndX, this.graphTop + this.graphHeight / 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    if (this.showEnvelope && simulation.pressureEnvelope) {
      this.drawPressureEnvelope(simulation);
    }
    
    this.drawComparisonWaves(pressureData);
    
    this.waveHistory.forEach((history, index) => {
      const alpha = 0.08 + (index / this.waveHistory.length) * 0.15;
      const hue = 200 + (index / this.waveHistory.length) * 40;
      this.ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      
      history.forEach((point, i) => {
        const x = this.pipeStartX + (i / (history.length - 1)) * this.pipeLength;
        const y = this.graphTop + this.graphHeight / 2 - (point / this.maxPressureDisplay) * (this.graphHeight / 2);
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      });
      this.ctx.stroke();
    });
    
    this.ctx.beginPath();
    const lineGradient = this.ctx.createLinearGradient(0, this.graphTop, 0, this.graphBottom);
    lineGradient.addColorStop(0, '#ff6b6b');
    lineGradient.addColorStop(0.3, '#ff8e8e');
    lineGradient.addColorStop(0.5, '#00d4ff');
    lineGradient.addColorStop(0.7, '#6b8bff');
    lineGradient.addColorStop(1, '#4a4aff');
    
    this.ctx.strokeStyle = lineGradient;
    this.ctx.lineWidth = 3;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    
    pressureData.y.forEach((pressure, i) => {
      const x = this.pipeStartX + (i / (numPoints - 1)) * this.pipeLength;
      const normalizedPressure = Math.max(-this.maxPressureDisplay, Math.min(this.maxPressureDisplay, pressure));
      const y = this.graphTop + this.graphHeight / 2 - (normalizedPressure / this.maxPressureDisplay) * (this.graphHeight / 2);
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });
    this.ctx.stroke();
    
    this.ctx.fillStyle = 'rgba(0, 212, 255, 0.12)';
    this.ctx.lineTo(this.pipeEndX, this.graphTop + this.graphHeight / 2);
    this.ctx.lineTo(this.pipeStartX, this.graphTop + this.graphHeight / 2);
    this.ctx.closePath();
    this.ctx.fill();
    
    const valvePressure = pressureData.y[pressureData.y.length - 1];
    const valveX = this.pipeEndX - 30;
    const valveY = this.graphTop + this.graphHeight / 2 - (valvePressure / this.maxPressureDisplay) * (this.graphHeight / 2);
    
    const glowSize = 12 + Math.sin(this.animationFrame * 0.1) * 3;
    const glowGradient = this.ctx.createRadialGradient(valveX, valveY, 0, valveX, valveY, glowSize);
    glowGradient.addColorStop(0, 'rgba(255, 107, 107, 0.8)');
    glowGradient.addColorStop(1, 'rgba(255, 107, 107, 0)');
    this.ctx.fillStyle = glowGradient;
    this.ctx.beginPath();
    this.ctx.arc(valveX, valveY, glowSize, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.beginPath();
    this.ctx.arc(valveX, valveY, 8, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ff6b6b';
    this.ctx.fill();
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 11px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`${valvePressure.toFixed(2)} MPa`, valveX + 12, valveY + 4);
    
    this.ctx.restore();
    
    this.drawPressureLabels();
    this.drawLegend(simulation);
    this.drawComparisonLegend();
  }
  
  drawComparisonWaves(currentPressureData) {
    if (this.comparisonWaves.length === 0) return;
    
    this.comparisonWaves.forEach((wave, index) => {
      if (!wave.data || !wave.data.y) return;
      
      this.ctx.beginPath();
      this.ctx.strokeStyle = wave.color;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.globalAlpha = 0.7;
      
      wave.data.y.forEach((pressure, i) => {
        const x = this.pipeStartX + (i / (wave.data.y.length - 1)) * this.pipeLength;
        const normalizedPressure = Math.max(-this.maxPressureDisplay, Math.min(this.maxPressureDisplay, pressure));
        const y = this.graphTop + this.graphHeight / 2 - (normalizedPressure / this.maxPressureDisplay) * (this.graphHeight / 2);
        
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      });
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.globalAlpha = 1;
    });
  }
  
  drawComparisonLegend() {
    if (this.comparisonWaves.length === 0) return;
    
    const legendX = this.pipeStartX + 380;
    const legendY = this.graphTop + 10;
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(legendX - 5, legendY - 5, 180, this.comparisonWaves.length * 18 + 10);
    
    this.ctx.font = 'bold 11px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText('对比波形:', legendX, legendY + 8);
    
    this.comparisonWaves.forEach((wave, i) => {
      const y = legendY + 28 + i * 18;
      this.ctx.strokeStyle = wave.color;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(legendX, y);
      this.ctx.lineTo(legendX + 25, y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      this.ctx.fillStyle = wave.color;
      this.ctx.fillText(wave.name, legendX + 32, y + 4);
    });
  }
  
  drawPressureEnvelope(simulation) {
    const envelope = simulation.getPressureEnvelope();
    if (!envelope || !envelope.max || envelope.max.length === 0) return;
    
    const numPoints = envelope.x.length;
    
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
    this.ctx.lineWidth = 2.5;
    this.ctx.setLineDash([10, 5]);
    
    envelope.max.forEach((pressure, i) => {
      const x = this.pipeStartX + (i / (numPoints - 1)) * this.pipeLength;
      const normalizedPressure = Math.max(-this.maxPressureDisplay, Math.min(this.maxPressureDisplay, pressure));
      const y = this.graphTop + this.graphHeight / 2 - (normalizedPressure / this.maxPressureDisplay) * (this.graphHeight / 2);
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(100, 150, 255, 0.7)';
    envelope.min.forEach((pressure, i) => {
      const x = this.pipeStartX + (i / (numPoints - 1)) * this.pipeLength;
      const normalizedPressure = Math.max(-this.maxPressureDisplay, Math.min(this.maxPressureDisplay, pressure));
      const y = this.graphTop + this.graphHeight / 2 - (normalizedPressure / this.maxPressureDisplay) * (this.graphHeight / 2);
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    this.ctx.fillStyle = 'rgba(255, 100, 100, 0.08)';
    this.ctx.beginPath();
    envelope.max.forEach((pressure, i) => {
      const x = this.pipeStartX + (i / (numPoints - 1)) * this.pipeLength;
      const normalizedPressure = Math.max(-this.maxPressureDisplay, Math.min(this.maxPressureDisplay, pressure));
      const y = this.graphTop + this.graphHeight / 2 - (normalizedPressure / this.maxPressureDisplay) * (this.graphHeight / 2);
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });
    for (let i = envelope.min.length - 1; i >= 0; i--) {
      const x = this.pipeStartX + (i / (numPoints - 1)) * this.pipeLength;
      const normalizedPressure = Math.max(-this.maxPressureDisplay, Math.min(this.maxPressureDisplay, envelope.min[i]));
      const y = this.graphTop + this.graphHeight / 2 - (normalizedPressure / this.maxPressureDisplay) * (this.graphHeight / 2);
      this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  drawLegend(simulation) {
    const legendX = this.pipeStartX + 10;
    const legendY = this.graphTop + 10;
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(legendX - 5, legendY - 5, 360, 50);
    
    this.ctx.font = '11px Arial';
    this.ctx.textAlign = 'left';
    
    if (this.showEnvelope) {
      this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([10, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(legendX, legendY + 5);
      this.ctx.lineTo(legendX + 25, legendY + 5);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      this.ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
      this.ctx.fillText('最大压力包络', legendX + 32, legendY + 9);
      
      this.ctx.strokeStyle = 'rgba(100, 150, 255, 0.7)';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([10, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(legendX + 120, legendY + 5);
      this.ctx.lineTo(legendX + 145, legendY + 5);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      this.ctx.fillStyle = 'rgba(100, 150, 255, 0.9)';
      this.ctx.fillText('最小压力包络', legendX + 152, legendY + 9);
    }
    
    const gradient = this.ctx.createLinearGradient(0, legendY + 18, 0, legendY + 30);
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(0.5, '#00d4ff');
    gradient.addColorStop(1, '#4a4aff');
    this.ctx.strokeStyle = gradient;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(legendX, legendY + 24);
    this.ctx.lineTo(legendX + 25, legendY + 24);
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.fillText('瞬时压力', legendX + 32, legendY + 28);
    
    const roundTripTime = simulation.getWaveRoundTripTime ? simulation.getWaveRoundTripTime() : 0;
    if (roundTripTime > 0) {
      this.ctx.fillStyle = '#888';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`波往返时间: ${roundTripTime.toFixed(3)}s`, this.pipeEndX - 10, legendY + 9);
      this.ctx.fillText(`当前时间: ${simulation.currentTime.toFixed(2)}s`, this.pipeEndX - 10, legendY + 28);
    }
  }
  
  drawPressureLabels() {
    this.ctx.fillStyle = '#aaa';
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'right';
    
    this.ctx.fillText(`+${this.maxPressureDisplay} MPa`, this.pipeStartX - 10, this.graphTop + 5);
    this.ctx.fillText('0 MPa', this.pipeStartX - 10, this.graphTop + this.graphHeight / 2 + 4);
    this.ctx.fillText(`-${this.maxPressureDisplay} MPa`, this.pipeStartX - 10, this.graphBottom - 5);
    
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.fillText('沿管道距离 (m)', this.width / 2, this.graphBottom + 18);
    
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('0 (水库)', this.pipeStartX, this.graphBottom + 18);
    this.ctx.textAlign = 'right';
    this.ctx.fillText('L (阀门)', this.pipeEndX, this.graphBottom + 18);
  }
  
  drawPipe(simulation) {
    const pipeY = this.pipeY;
    const pipeHeight = this.pipeHeight;
    
    if (this.show3DPipe) {
      this.draw3DPipe(simulation, pipeY, pipeHeight);
    } else {
      this.draw2DPipe(simulation, pipeY, pipeHeight);
    }
    
    this.drawTank();
    this.drawValve(simulation.valveOpening);
    this.drawPipeLabels(simulation);
  }
  
  draw2DPipe(simulation, pipeY, pipeHeight) {
    const pipeGradient = this.ctx.createLinearGradient(0, pipeY - pipeHeight / 2, 0, pipeY + pipeHeight / 2);
    pipeGradient.addColorStop(0, '#3a4a5a');
    pipeGradient.addColorStop(0.3, '#5a6a7a');
    pipeGradient.addColorStop(0.7, '#4a5a6a');
    pipeGradient.addColorStop(1, '#2a3a4a');
    
    this.ctx.fillStyle = pipeGradient;
    this.ctx.fillRect(this.pipeStartX, pipeY - pipeHeight / 2, this.pipeLength, pipeHeight);
    
    this.ctx.strokeStyle = '#6a7a8a';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(this.pipeStartX, pipeY - pipeHeight / 2, this.pipeLength, pipeHeight);
    
    if (this.showPressureGradient) {
      this.drawPressureColorOverlay(simulation, pipeY, pipeHeight);
    }
    
    this.drawFluidFlow(pipeY, pipeHeight, simulation.currentTime, simulation.initialVelocity);
    this.drawWaveIndicators(simulation);
  }
  
  draw3DPipe(simulation, pipeY, pipeHeight) {
    const depth = 25;
    
    this.ctx.fillStyle = 'rgba(20, 30, 40, 0.8)';
    this.ctx.beginPath();
    this.ctx.moveTo(this.pipeStartX, pipeY - pipeHeight / 2);
    this.ctx.lineTo(this.pipeStartX - depth, pipeY - pipeHeight / 2 - depth);
    this.ctx.lineTo(this.pipeEndX - depth, pipeY - pipeHeight / 2 - depth);
    this.ctx.lineTo(this.pipeEndX, pipeY - pipeHeight / 2);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = 'rgba(30, 40, 50, 0.9)';
    this.ctx.beginPath();
    this.ctx.moveTo(this.pipeEndX, pipeY - pipeHeight / 2);
    this.ctx.lineTo(this.pipeEndX - depth, pipeY - pipeHeight / 2 - depth);
    this.ctx.lineTo(this.pipeEndX - depth, pipeY + pipeHeight / 2 - depth);
    this.ctx.lineTo(this.pipeEndX, pipeY + pipeHeight / 2);
    this.ctx.closePath();
    this.ctx.fill();
    
    const pipeGradient = this.ctx.createLinearGradient(0, pipeY - pipeHeight / 2, 0, pipeY + pipeHeight / 2);
    pipeGradient.addColorStop(0, '#4a5a6a');
    pipeGradient.addColorStop(0.2, '#6a7a8a');
    pipeGradient.addColorStop(0.5, '#5a6a7a');
    pipeGradient.addColorStop(0.8, '#4a5a6a');
    pipeGradient.addColorStop(1, '#3a4a5a');
    
    this.ctx.fillStyle = pipeGradient;
    this.ctx.fillRect(this.pipeStartX, pipeY - pipeHeight / 2, this.pipeLength, pipeHeight);
    
    this.ctx.strokeStyle = '#7a8a9a';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(this.pipeStartX, pipeY - pipeHeight / 2, this.pipeLength, pipeHeight);
    
    this.ctx.strokeStyle = '#8a9aaa';
    this.ctx.lineWidth = 1;
    const ringSpacing = 80;
    for (let x = this.pipeStartX + ringSpacing; x < this.pipeEndX; x += ringSpacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, pipeY - pipeHeight / 2 + 5);
      this.ctx.lineTo(x, pipeY + pipeHeight / 2 - 5);
      this.ctx.stroke();
    }
    
    if (this.showPressureGradient) {
      this.drawPressureColorOverlay(simulation, pipeY, pipeHeight);
    }
    
    this.ctx.fillStyle = 'rgba(0, 50, 80, 0.3)';
    this.ctx.fillRect(this.pipeStartX + 5, pipeY - pipeHeight / 2 + 5, this.pipeLength - 10, pipeHeight - 10);
    
    this.drawFluidFlow3D(pipeY, pipeHeight, simulation.currentTime, simulation.initialVelocity);
    this.drawWaveIndicators(simulation);
  }
  
  drawPressureColorOverlay(simulation, pipeY, pipeHeight) {
    const pressureData = simulation.getPressureData();
    const numPoints = pressureData.y.length;
    
    for (let i = 0; i < numPoints - 1; i++) {
      const x1 = this.pipeStartX + (i / (numPoints - 1)) * this.pipeLength;
      const x2 = this.pipeStartX + ((i + 1) / (numPoints - 1)) * this.pipeLength;
      
      const pressure = pressureData.y[i];
      const normalizedPressure = pressure / this.maxPressureDisplay;
      
      let r, g, b;
      if (pressure > 0) {
        r = Math.floor(255 * Math.min(1, normalizedPressure * 0.8));
        g = Math.floor(150 * (1 - Math.min(1, normalizedPressure * 0.5)));
        b = Math.floor(150 * (1 - Math.min(1, normalizedPressure * 0.3)));
      } else {
        r = Math.floor(150 * (1 - Math.min(1, Math.abs(normalizedPressure) * 0.3)));
        g = Math.floor(150 * (1 - Math.min(1, Math.abs(normalizedPressure) * 0.5)));
        b = Math.floor(255 * Math.min(1, Math.abs(normalizedPressure) * 0.8));
      }
      
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
      this.ctx.fillRect(x1, pipeY - pipeHeight / 2 + 8, x2 - x1, pipeHeight - 16);
    }
  }
  
  drawWaveIndicators(simulation) {
    const pressureData = simulation.getPressureData();
    const numPoints = pressureData.y.length;
    const pipeY = this.pipeY;
    
    for (let i = 0; i < numPoints; i += 4) {
      const x = this.pipeStartX + (i / (numPoints - 1)) * this.pipeLength;
      const pressure = pressureData.y[i];
      
      if (Math.abs(pressure) > 0.15) {
        const arrowHeight = Math.min(40, Math.abs(pressure) * 12);
        const direction = pressure > 0 ? 1 : -1;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, pipeY);
        this.ctx.lineTo(x, pipeY - direction * arrowHeight);
        this.ctx.strokeStyle = pressure > 0 ? 'rgba(255, 100, 100, 0.6)' : 'rgba(100, 150, 255, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        this.ctx.beginPath();
        this.ctx.moveTo(x - 5, pipeY - direction * (arrowHeight - 6));
        this.ctx.lineTo(x, pipeY - direction * arrowHeight);
        this.ctx.lineTo(x + 5, pipeY - direction * (arrowHeight - 6));
        this.ctx.stroke();
      }
    }
  }
  
  drawFluidFlow(pipeY, pipeHeight, time, velocity) {
    const flowSpeed = velocity * 4;
    const numParticles = 25;
    
    for (let i = 0; i < numParticles; i++) {
      const offset = ((time * flowSpeed * 25 + i * (this.pipeLength / numParticles)) % this.pipeLength);
      const x = this.pipeStartX + offset;
      const y = pipeY - pipeHeight / 3 + (i % 3) * (pipeHeight / 3.5);
      
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(0, 212, 255, ${0.5 + Math.sin(time * 3 + i * 0.5) * 0.3})`;
      this.ctx.fill();
    }
  }
  
  drawFluidFlow3D(pipeY, pipeHeight, time, velocity) {
    const flowSpeed = velocity * 4;
    const numParticles = 30;
    
    for (let i = 0; i < numParticles; i++) {
      const offset = ((time * flowSpeed * 25 + i * (this.pipeLength / numParticles)) % this.pipeLength);
      const x = this.pipeStartX + offset;
      const layer = i % 3;
      const y = pipeY - pipeHeight / 3 + layer * (pipeHeight / 3.5);
      const zOffset = layer * 8;
      const size = 3 - layer * 0.8;
      
      this.ctx.beginPath();
      this.ctx.arc(x - zOffset, y - zOffset / 2, size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(0, 212, 255, ${0.6 + Math.sin(time * 3 + i * 0.5) * 0.2})`;
      this.ctx.fill();
    }
  }
  
  drawTank() {
    const tankX = this.pipeStartX - 55;
    const tankWidth = 65;
    const tankHeight = 130;
    const tankY = this.pipeY - tankHeight / 2;
    
    this.ctx.fillStyle = '#2a3a4a';
    this.ctx.beginPath();
    this.ctx.moveTo(tankX - 15, tankY - 15);
    this.ctx.lineTo(tankX + tankWidth - 15, tankY - 15);
    this.ctx.lineTo(tankX + tankWidth, tankY);
    this.ctx.lineTo(tankX, tankY);
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.fillStyle = '#3a4a5a';
    this.ctx.strokeStyle = '#6a7a8a';
    this.ctx.lineWidth = 2;
    
    this.ctx.beginPath();
    this.ctx.roundRect(tankX, tankY, tankWidth, tankHeight, [8, 8, 0, 0]);
    this.ctx.fill();
    this.ctx.stroke();
    
    const waterLevel = tankHeight * 0.7;
    const waterGradient = this.ctx.createLinearGradient(0, tankY + tankHeight - waterLevel, 0, tankY + tankHeight);
    waterGradient.addColorStop(0, 'rgba(0, 180, 220, 0.95)');
    waterGradient.addColorStop(0.5, 'rgba(0, 140, 180, 0.85)');
    waterGradient.addColorStop(1, 'rgba(0, 100, 150, 0.75)');
    this.ctx.fillStyle = waterGradient;
    this.ctx.fillRect(tankX + 4, tankY + tankHeight - waterLevel, tankWidth - 8, waterLevel - 4);
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const waveY = tankY + tankHeight - waterLevel + 15 + i * 20;
      const waveOffset = Math.sin(this.animationFrame * 0.05 + i) * 3;
      this.ctx.beginPath();
      this.ctx.moveTo(tankX + 4, waveY + waveOffset);
      this.ctx.quadraticCurveTo(
        tankX + tankWidth / 2, waveY + waveOffset + 5,
        tankX + tankWidth - 4, waveY + waveOffset
      );
      this.ctx.stroke();
    }
    
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.font = 'bold 12px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('上游水库', tankX + tankWidth / 2, tankY + tankHeight + 22);
  }
  
  drawValve(opening) {
    const valveX = this.pipeEndX - 30;
    const valveY = this.pipeY;
    const valveWidth = 22;
    const valveHeight = this.pipeHeight - 10;
    
    this.ctx.fillStyle = '#654321';
    this.ctx.fillRect(valveX - 4, valveY - valveHeight / 2 - 25, 8, 25);
    
    this.ctx.fillStyle = '#5a3a1a';
    this.ctx.beginPath();
    this.ctx.arc(valveX, valveY - valveHeight / 2 - 25, 8, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.strokeStyle = '#8b4513';
    this.ctx.lineWidth = 2;
    
    const discAngle = (1 - opening) * 90;
    
    this.ctx.save();
    this.ctx.translate(valveX, valveY);
    this.ctx.rotate((discAngle * Math.PI) / 180);
    
    const discGradient = this.ctx.createLinearGradient(-valveWidth / 2, 0, valveWidth / 2, 0);
    discGradient.addColorStop(0, '#b8860b');
    discGradient.addColorStop(0.5, '#daa520');
    discGradient.addColorStop(1, '#b8860b');
    
    this.ctx.fillStyle = discGradient;
    this.ctx.fillRect(-valveWidth / 2, -valveHeight / 2, valveWidth, valveHeight);
    this.ctx.strokeRect(-valveWidth / 2, -valveHeight / 2, valveWidth, valveHeight);
    
    this.ctx.strokeStyle = '#ffd700';
    this.ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(-valveWidth / 2, i * (valveHeight / 6));
      this.ctx.lineTo(valveWidth / 2, i * (valveHeight / 6));
      this.ctx.stroke();
    }
    
    this.ctx.restore();
    
    const openColor = opening > 0.5 ? '#4caf50' : opening > 0.2 ? '#ff9800' : '#ff6b6b';
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(valveX - 50, valveY + this.pipeHeight / 2 + 8, 100, 28);
    
    this.ctx.fillStyle = openColor;
    this.ctx.font = 'bold 12px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`阀门 ${Math.round(opening * 100)}%`, valveX, valveY + this.pipeHeight / 2 + 28);
    
    this.ctx.fillStyle = '#666';
    this.ctx.font = '10px Arial';
    const curves = ['linear', 'fastClose', 'slowClose', 'parabolic', 'twoStage', 'optimized'];
  }
  
  drawPipeLabels(simulation) {
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'center';
    
    this.ctx.beginPath();
    this.ctx.moveTo(this.pipeStartX, this.pipeY + this.pipeHeight / 2 + 45);
    this.ctx.lineTo(this.pipeEndX, this.pipeY + this.pipeHeight / 2 + 45);
    this.ctx.strokeStyle = '#00d4ff';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.moveTo(this.pipeStartX, this.pipeY + this.pipeHeight / 2 + 40);
    this.ctx.lineTo(this.pipeStartX, this.pipeY + this.pipeHeight / 2 + 50);
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.moveTo(this.pipeEndX, this.pipeY + this.pipeHeight / 2 + 40);
    this.ctx.lineTo(this.pipeEndX, this.pipeY + this.pipeHeight / 2 + 50);
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.fillText(`管道长度 L = ${simulation.pipeLength} m`, this.width / 2, this.pipeY + this.pipeHeight / 2 + 62);
    
    this.ctx.fillStyle = '#888';
    this.ctx.font = '11px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`管径: ${simulation.pipeDiameter} m`, this.pipeStartX, this.pipeY + this.pipeHeight / 2 + 85);
    this.ctx.fillText(`波速: ${simulation.waveSpeed} m/s`, this.pipeStartX + 150, this.pipeY + this.pipeHeight / 2 + 85);
    this.ctx.fillText(`初始流速: ${simulation.initialVelocity} m/s`, this.pipeStartX + 320, this.pipeY + this.pipeHeight / 2 + 85);
  }
  
  drawWaveParticles(simulation) {
    const pressureData = simulation.getPressureData();
    
    this.waveParticles = this.waveParticles.filter(p => p.life > 0);
    
    if (Math.random() < 0.25) {
      const randomIndex = Math.floor(Math.random() * pressureData.y.length);
      const pressure = pressureData.y[randomIndex];
      if (Math.abs(pressure) > 0.25) {
        this.waveParticles.push({
          x: this.pipeStartX + (randomIndex / (pressureData.y.length - 1)) * this.pipeLength,
          y: this.graphTop + this.graphHeight / 2 - (pressure / this.maxPressureDisplay) * (this.graphHeight / 2),
          vx: (Math.random() - 0.5) * 1.8,
          vy: -Math.abs(pressure) * 1.8,
          life: 30,
          maxLife: 30,
          pressure: pressure
        });
      }
    }
    
    this.waveParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.09;
      p.life--;
      
      const alpha = p.life / p.maxLife;
      const color = p.pressure > 0 ? 
        `rgba(255, 107, 107, ${alpha})` : 
        `rgba(107, 149, 255, ${alpha})`;
      
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3 * alpha, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();
    });
  }
  
  updateWaveHistory(simulation) {
    const pressureData = simulation.getPressureData();
    this.waveHistory.push([...pressureData.y]);
    if (this.waveHistory.length > this.maxHistoryLength) {
      this.waveHistory.shift();
    }
  }
  
  render(simulation, time) {
    this.animationFrame++;
    this.timeOffset = time;
    
    this.clear();
    this.drawPressureGraph(simulation, time);
    this.drawWaveParticles(simulation);
    this.drawPipe(simulation);
    
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.font = 'bold 16px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('水锤压力波分布', this.pipeStartX, this.graphTop - 10);
    
    this.ctx.fillStyle = '#666';
    this.ctx.font = '11px Arial';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('水锤防护工程分析系统 v2.0', this.pipeEndX, this.graphTop - 10);
  }
}
