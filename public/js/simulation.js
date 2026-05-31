class WaterHammerSimulation {
  constructor(options = {}) {
    this.pipeLength = options.pipeLength || 1000;
    this.pipeDiameter = options.pipeDiameter || 0.5;
    this.waveSpeed = options.waveSpeed || 1000;
    this.initialVelocity = options.initialVelocity || 2;
    this.valveCloseTime = options.valveCloseTime || 1;
    this.density = options.density || 1000;
    
    this.numNodes = options.numNodes || 100;
    this.dx = this.pipeLength / (this.numNodes - 1);
    this.dt = this.dx / this.waveSpeed;
    
    this.pressures = new Array(this.numNodes).fill(0);
    this.velocities = new Array(this.numNodes).fill(this.initialVelocity);
    
    this.oldPressures = new Array(this.numNodes).fill(0);
    this.oldVelocities = new Array(this.numNodes).fill(this.initialVelocity);
    
    this.currentTime = 0;
    this.maxPressure = 0;
    this.minPressure = 0;
    this.valveOpening = 1;
    this.isRunning = false;
    
    this.upstreamTankHead = 0;
    this.g = 9.81;
    
    this.pressureEnvelope = {
      max: new Array(this.numNodes).fill(0),
      min: new Array(this.numNodes).fill(0)
    };
    
    this.theoreticalMaxPressure = this.density * this.waveSpeed * this.initialVelocity / 1e6;
    this.waveRoundTripTime = 2 * this.pipeLength / this.waveSpeed;
    
    this.branches = [];
    this.junctionNodes = [];
  }
  
  reset() {
    this.pressures = new Array(this.numNodes).fill(0);
    this.velocities = new Array(this.numNodes).fill(this.initialVelocity);
    this.oldPressures = new Array(this.numNodes).fill(0);
    this.oldVelocities = new Array(this.numNodes).fill(this.initialVelocity);
    this.currentTime = 0;
    this.maxPressure = 0;
    this.minPressure = 0;
    this.valveOpening = 1;
    this.isRunning = false;
    
    this.pressureEnvelope = {
      max: new Array(this.numNodes).fill(0),
      min: new Array(this.numNodes).fill(0)
    };
  }
  
  updateParameters(options) {
    if (options.pipeLength !== undefined) {
      this.pipeLength = options.pipeLength;
      this.dx = this.pipeLength / (this.numNodes - 1);
      this.dt = this.dx / this.waveSpeed;
      this.waveRoundTripTime = 2 * this.pipeLength / this.waveSpeed;
    }
    if (options.pipeDiameter !== undefined) this.pipeDiameter = options.pipeDiameter;
    if (options.waveSpeed !== undefined) {
      this.waveSpeed = options.waveSpeed;
      this.dt = this.dx / this.waveSpeed;
      this.waveRoundTripTime = 2 * this.pipeLength / this.waveSpeed;
    }
    if (options.initialVelocity !== undefined) this.initialVelocity = options.initialVelocity;
    if (options.valveCloseTime !== undefined) this.valveCloseTime = options.valveCloseTime;
    
    this.theoreticalMaxPressure = this.density * this.waveSpeed * this.initialVelocity / 1e6;
    
    this.pressureEnvelope = {
      max: new Array(this.numNodes).fill(0),
      min: new Array(this.numNodes).fill(0)
    };
  }
  
  addJunction(nodeIndex, branches) {
    this.junctionNodes.push(nodeIndex);
    this.branches.push({
      nodeIndex,
      branches
    });
  }
  
  calculateJunctionImpedance(mainPipe, branchPipes) {
    const Z_main = (this.density * this.waveSpeed) / (Math.PI * Math.pow(mainPipe.diameter / 2, 2));
    
    let Z_branches_parallel = 0;
    branchPipes.forEach(branch => {
      const Z_branch = (this.density * branch.waveSpeed) / (Math.PI * Math.pow(branch.diameter / 2, 2));
      Z_branches_parallel += 1 / Z_branch;
    });
    const Z_branches = 1 / Z_branches_parallel;
    
    const reflectionCoefficient = (Z_branches - Z_main) / (Z_branches + Z_main);
    const transmissionCoefficient = (2 * Z_branches) / (Z_branches + Z_main);
    
    return {
      Z_main,
      Z_branches,
      reflectionCoefficient,
      transmissionCoefficient
    };
  }
  
  calculateValveOpening(time) {
    if (time >= this.valveCloseTime) return 0;
    
    const progress = time / this.valveCloseTime;
    const opening = 1 - progress;
    
    return Math.max(0, opening);
  }
  
  calculateValveFlowCoefficient(opening) {
    const Cv_max = 1.0;
    const effectiveOpening = Math.pow(opening, 1.5);
    return Cv_max * effectiveOpening;
  }
  
  step() {
    if (!this.isRunning) return;
    
    this.currentTime += this.dt;
    
    this.valveOpening = this.calculateValveOpening(this.currentTime);
    
    this.oldPressures = [...this.pressures];
    this.oldVelocities = [...this.velocities];
    
    for (let i = 1; i < this.numNodes - 1; i++) {
      if (this.junctionNodes.includes(i)) {
        this.computeJunctionNode(i);
      } else {
        this.computeInternalNode(i);
      }
    }
    
    this.computeUpstreamBoundary();
    this.computeDownstreamBoundary();
    
    for (let i = 0; i < this.numNodes; i++) {
      if (this.pressures[i] > this.pressureEnvelope.max[i]) {
        this.pressureEnvelope.max[i] = this.pressures[i];
      }
      if (this.pressures[i] < this.pressureEnvelope.min[i]) {
        this.pressureEnvelope.min[i] = this.pressures[i];
      }
    }
    
    const currentMax = Math.max(...this.pressures);
    const currentMin = Math.min(...this.pressures);
    if (currentMax > this.maxPressure) {
      this.maxPressure = currentMax;
    }
    if (currentMin < this.minPressure) {
      this.minPressure = currentMin;
    }
    
    return {
      time: this.currentTime,
      pressures: [...this.pressures],
      velocities: [...this.velocities],
      maxPressure: this.maxPressure,
      minPressure: this.minPressure,
      valveOpening: this.valveOpening,
      pressureEnvelope: this.getPressureEnvelope()
    };
  }
  
  computeInternalNode(i) {
    const a = this.waveSpeed;
    const rho = this.density;
    
    const Cp = this.oldPressures[i-1] + rho * a * this.oldVelocities[i-1];
    const Cm = this.oldPressures[i+1] - rho * a * this.oldVelocities[i+1];
    
    this.pressures[i] = (Cp + Cm) / 2;
    this.velocities[i] = (Cp - Cm) / (2 * rho * a);
    
    const f = 0.02;
    const D = this.pipeDiameter;
    const V = this.oldVelocities[i];
    const frictionTerm = f * this.dt * V * Math.abs(V) / (2 * D);
    this.velocities[i] -= frictionTerm;
  }
  
  computeJunctionNode(i) {
    const junction = this.branches.find(b => b.nodeIndex === i);
    if (!junction) {
      this.computeInternalNode(i);
      return;
    }
    
    const a = this.waveSpeed;
    const rho = this.density;
    
    const mainPipe = { diameter: this.pipeDiameter, waveSpeed: a };
    const impedance = this.calculateJunctionImpedance(mainPipe, junction.branches);
    
    const Cp_left = this.oldPressures[i-1] + rho * a * this.oldVelocities[i-1];
    const Cm_right = this.oldPressures[i+1] - rho * a * this.oldVelocities[i+1];
    
    this.pressures[i] = (Cp_left + Cm_right) / 2;
    
    const reflectedPressure = impedance.reflectionCoefficient * (this.pressures[i] - this.oldPressures[i]);
    this.pressures[i] += reflectedPressure * 0.3;
    
    this.velocities[i] = (Cp_left - this.pressures[i]) / (rho * a);
  }
  
  computeUpstreamBoundary() {
    const a = this.waveSpeed;
    const rho = this.density;
    
    const reservoirPressure = 0;
    const Cm = this.oldPressures[1] - rho * a * this.oldVelocities[1];
    
    this.pressures[0] = reservoirPressure;
    this.velocities[0] = (reservoirPressure - Cm) / (-rho * a);
    
    this.velocities[0] = Math.max(-this.initialVelocity * 2, Math.min(this.initialVelocity * 2, this.velocities[0]));
  }
  
  computeDownstreamBoundary() {
    const a = this.waveSpeed;
    const rho = this.density;
    
    const Cp = this.oldPressures[this.numNodes - 2] + rho * a * this.oldVelocities[this.numNodes - 2];
    
    if (this.valveOpening > 0.001) {
      const Cv = this.calculateValveFlowCoefficient(this.valveOpening);
      
      const flowFactor = rho * a;
      
      const dV_dt = -this.initialVelocity / Math.max(this.valveCloseTime, 0.001);
      const instantaneousPressure = rho * a * (-dV_dt * this.dt);
      
      const closeRatio = this.waveRoundTripTime / Math.max(this.valveCloseTime, 0.001);
      const pressureReductionFactor = Math.min(1, closeRatio);
      
      const targetVelocity = this.initialVelocity * this.valveOpening;
      
      const valvePressure = Cp - flowFactor * targetVelocity;
      
      const adjustedPressure = valvePressure * pressureReductionFactor;
      
      this.pressures[this.numNodes - 1] = adjustedPressure;
      this.velocities[this.numNodes - 1] = targetVelocity;
      
    } else {
      this.velocities[this.numNodes - 1] = 0;
      this.pressures[this.numNodes - 1] = Cp;
    }
    
    const maxTheoretical = rho * a * this.initialVelocity;
    this.pressures[this.numNodes - 1] = Math.max(-maxTheoretical * 1.5, Math.min(maxTheoretical * 1.5, this.pressures[this.numNodes - 1]));
  }
  
  getPressureData() {
    return {
      x: Array.from({ length: this.numNodes }, (_, i) => i * this.dx),
      y: this.pressures.map(p => p / 1e6)
    };
  }
  
  getPressureEnvelope() {
    return {
      x: Array.from({ length: this.numNodes }, (_, i) => i * this.dx),
      max: this.pressureEnvelope.max.map(p => p / 1e6),
      min: this.pressureEnvelope.min.map(p => p / 1e6)
    };
  }
  
  getFullSnapshot() {
    return {
      time: this.currentTime,
      maxPressure: this.getMaxPressureMPa(),
      minPressure: this.minPressure / 1e6,
      valveOpening: this.valveOpening,
      pressureDistribution: [...this.pressures],
      velocityDistribution: [...this.velocities],
      pressureEnvelope: {
        max: [...this.pressureEnvelope.max],
        min: [...this.pressureEnvelope.min]
      },
      pipeParameters: {
        length: this.pipeLength,
        diameter: this.pipeDiameter,
        waveSpeed: this.waveSpeed,
        initialVelocity: this.initialVelocity,
        valveCloseTime: this.valveCloseTime
      }
    };
  }
  
  getMaxPressureMPa() {
    return this.maxPressure / 1e6;
  }
  
  getMinPressureMPa() {
    return this.minPressure / 1e6;
  }
  
  getCurrentPressureAtValve() {
    return this.pressures[this.numNodes - 1] / 1e6;
  }
  
  getWaveRoundTripTime() {
    return this.waveRoundTripTime;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WaterHammerSimulation;
}
