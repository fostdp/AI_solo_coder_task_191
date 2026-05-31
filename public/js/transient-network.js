const ValveCurves = {
  linear: (t, T) => {
    if (t >= T) return 0;
    return 1 - t / T;
  },
  
  fastClose: (t, T) => {
    if (t >= T * 0.3) return 0;
    return 1 - (t / (T * 0.3));
  },
  
  slowClose: (t, T) => {
    if (t >= T) return 0;
    const progress = t / T;
    return Math.exp(-4 * progress);
  },
  
  parabolic: (t, T) => {
    if (t >= T) return 0;
    const progress = t / T;
    return 1 - progress * progress;
  },
  
  twoStage: (t, T) => {
    if (t >= T) return 0;
    const progress = t / T;
    if (progress < 0.5) {
      return 1 - progress;
    } else {
      return 0.5 - 0.5 * ((progress - 0.5) / 0.5);
    }
  },
  
  optimized: (t, T) => {
    if (t >= T) return 0;
    const progress = t / T;
    if (progress < 0.2) {
      return 1;
    } else if (progress < 0.8) {
      return 1 - 1.5 * (progress - 0.2);
    } else {
      return 0.1 - 0.1 * ((progress - 0.8) / 0.2);
    }
  }
};

class PipeElement {
  constructor(id, options = {}) {
    this.id = id;
    this.type = 'generic';
    this.density = options.density || 1000;
    this.waveSpeed = options.waveSpeed || 1000;
    this.dt = options.dt || 0.01;
    
    this.upstreamNode = null;
    this.downstreamNode = null;
  }
  
  connectUpstream(node) {
    this.upstreamNode = node;
    node.downstreamElements.push(this);
  }
  
  connectDownstream(node) {
    this.downstreamNode = node;
    node.upstreamElements.push(this);
  }
  
  initialize() {}
  computeBoundaryConditions(time) {}
  computeInternalNodes() {}
  updateEnvelope() {}
  getState() { return {}; }
}

class Pipe extends PipeElement {
  constructor(id, options = {}) {
    super(id, options);
    this.type = 'pipe';
    
    this.length = options.length || 1000;
    this.diameter = options.diameter || 0.5;
    this.initialVelocity = options.initialVelocity || 2;
    this.frictionFactor = options.frictionFactor || 0.02;
    this.numNodes = options.numNodes || Math.max(20, Math.floor(this.length / 50));
    
    this.dx = this.length / (this.numNodes - 1);
    this.dt = this.dx / this.waveSpeed;
    
    this.area = Math.PI * Math.pow(this.diameter / 2, 2);
    this.impedance = (this.density * this.waveSpeed) / this.area;
    
    this.pressures = new Array(this.numNodes).fill(0);
    this.velocities = new Array(this.numNodes).fill(this.initialVelocity);
    this.oldPressures = new Array(this.numNodes).fill(0);
    this.oldVelocities = new Array(this.numNodes).fill(this.initialVelocity);
    
    this.envelope = {
      max: new Array(this.numNodes).fill(0),
      min: new Array(this.numNodes).fill(0)
    };
    
    this.upstreamPressure = 0;
    this.downstreamPressure = 0;
    this.upstreamVelocity = this.initialVelocity;
    this.downstreamVelocity = this.initialVelocity;
  }
  
  initialize() {
    this.pressures = new Array(this.numNodes).fill(0);
    this.velocities = new Array(this.numNodes).fill(this.initialVelocity);
    this.oldPressures = new Array(this.numNodes).fill(0);
    this.oldVelocities = new Array(this.numNodes).fill(this.initialVelocity);
    
    this.envelope = {
      max: new Array(this.numNodes).fill(0),
      min: new Array(this.numNodes).fill(0)
    };
  }
  
  computeInternalNodes() {
    const a = this.waveSpeed;
    const rho = this.density;
    const f = this.frictionFactor;
    const D = this.diameter;
    
    for (let i = 1; i < this.numNodes - 1; i++) {
      const Cp = this.oldPressures[i-1] + rho * a * this.oldVelocities[i-1];
      const Cm = this.oldPressures[i+1] - rho * a * this.oldVelocities[i+1];
      
      this.pressures[i] = (Cp + Cm) / 2;
      this.velocities[i] = (Cp - Cm) / (2 * rho * a);
      
      const V = this.oldVelocities[i];
      const frictionTerm = f * this.dt * V * Math.abs(V) / (2 * D);
      this.velocities[i] -= frictionTerm;
    }
  }
  
  setBoundaryConditions(upstreamP, upstreamV, downstreamP, downstreamV) {
    this.pressures[0] = upstreamP;
    this.velocities[0] = upstreamV;
    this.pressures[this.numNodes - 1] = downstreamP;
    this.velocities[this.numNodes - 1] = downstreamV;
  }
  
  updateEnvelope() {
    for (let i = 0; i < this.numNodes; i++) {
      if (this.pressures[i] > this.envelope.max[i]) {
        this.envelope.max[i] = this.pressures[i];
      }
      if (this.pressures[i] < this.envelope.min[i]) {
        this.envelope.min[i] = this.pressures[i];
      }
    }
  }
  
  getUpstreamInvariant() {
    const a = this.waveSpeed;
    const rho = this.density;
    return this.pressures[1] - rho * a * this.velocities[1];
  }
  
  getDownstreamInvariant() {
    const a = this.waveSpeed;
    const rho = this.density;
    return this.pressures[this.numNodes - 2] + rho * a * this.velocities[this.numNodes - 2];
  }
  
  getMaxPressure() {
    return Math.max(...this.pressures);
  }
  
  getMinPressure() {
    return Math.min(...this.pressures);
  }
  
  getState() {
    return {
      pressures: [...this.pressures],
      velocities: [...this.velocities],
      envelope: {
        max: [...this.envelope.max],
        min: [...this.envelope.min]
      }
    };
  }
  
  getPositionArray() {
    return Array.from({ length: this.numNodes }, (_, i) => i * this.dx);
  }
}

class Valve extends PipeElement {
  constructor(id, options = {}) {
    super(id, options);
    this.type = 'valve';
    
    this.closeTime = options.closeTime || 1;
    this.curveType = options.curveType || 'linear';
    this.curveFunction = ValveCurves[this.curveType] || ValveCurves.linear;
    this.Cv_max = options.Cv_max || 1.0;
    this.opening = 1;
    this.initialVelocity = options.initialVelocity || 2;
  }
  
  setCurveType(curveType) {
    this.curveType = curveType;
    this.curveFunction = ValveCurves[curveType] || ValveCurves.linear;
  }
  
  computeBoundaryConditions(time) {
    this.opening = this.curveFunction(time, this.closeTime);
    this.opening = Math.max(0, Math.min(1, this.opening));
    return this.opening;
  }
  
  getFlowCoefficient() {
    return this.Cv_max * Math.pow(this.opening, 1.5);
  }
  
  getState() {
    return {
      opening: this.opening,
      curveType: this.curveType,
      closeTime: this.closeTime,
      Cv: this.getFlowCoefficient()
    };
  }
}

class Junction extends PipeElement {
  constructor(id, options = {}) {
    super(id, options);
    this.type = 'junction';
    
    this.upstreamPipes = [];
    this.downstreamPipes = [];
    this.position = 0;
    
    this.pressure = 0;
    this.reflectionCoefficient = 0;
    this.transmissionCoefficient = 1;
  }
  
  addUpstreamPipe(pipe) {
    this.upstreamPipes.push(pipe);
  }
  
  addDownstreamPipe(pipe) {
    this.downstreamPipes.push(pipe);
  }
  
  calculateImpedance() {
    if (this.upstreamPipes.length === 0 || this.downstreamPipes.length === 0) {
      return { Z_upstream: 0, Z_downstream: 0, R: 0, T: 1 };
    }
    
    let Z_upstream_parallel = 0;
    this.upstreamPipes.forEach(pipe => {
      Z_upstream_parallel += 1 / pipe.impedance;
    });
    const Z_upstream = 1 / Z_upstream_parallel;
    
    let Z_downstream_parallel = 0;
    this.downstreamPipes.forEach(pipe => {
      Z_downstream_parallel += 1 / pipe.impedance;
    });
    const Z_downstream = 1 / Z_downstream_parallel;
    
    const R = (Z_downstream - Z_upstream) / (Z_downstream + Z_upstream);
    const T = (2 * Z_downstream) / (Z_downstream + Z_upstream);
    
    this.reflectionCoefficient = R;
    this.transmissionCoefficient = T;
    
    return { Z_upstream, Z_downstream, R, T };
  }
  
  computeBoundaryConditions(time) {
    const impedance = this.calculateImpedance();
    
    let incomingPressure = 0;
    let totalWeight = 0;
    
    this.upstreamPipes.forEach(pipe => {
      const Cp = pipe.getDownstreamInvariant();
      incomingPressure += Cp / pipe.impedance;
      totalWeight += 1 / pipe.impedance;
    });
    
    if (totalWeight > 0) {
      this.pressure = incomingPressure / totalWeight;
    }
    
    return {
      pressure: this.pressure,
      reflectionCoefficient: impedance.R,
      transmissionCoefficient: impedance.T
    };
  }
  
  getState() {
    return {
      pressure: this.pressure,
      reflectionCoefficient: this.reflectionCoefficient,
      transmissionCoefficient: this.transmissionCoefficient,
      numUpstream: this.upstreamPipes.length,
      numDownstream: this.downstreamPipes.length
    };
  }
}

class Reservoir extends PipeElement {
  constructor(id, options = {}) {
    super(id, options);
    this.type = 'reservoir';
    
    this.pressure = options.pressure || 0;
    this.head = options.head || 0;
    this.g = 9.81;
    
    if (this.head > 0 && this.pressure === 0) {
      this.pressure = this.density * this.g * this.head;
    }
  }
  
  computeBoundaryConditions(time) {
    return this.pressure;
  }
  
  getPressure() {
    return this.pressure;
  }
  
  getState() {
    return {
      pressure: this.pressure,
      head: this.head
    };
  }
}

class EnvelopeTracker {
  constructor() {
    this.pipeEnvelopes = new Map();
    this.globalMax = 0;
    this.globalMin = 0;
  }
  
  trackPipe(pipe) {
    if (!this.pipeEnvelopes.has(pipe.id)) {
      this.pipeEnvelopes.set(pipe.id, {
        max: new Array(pipe.numNodes).fill(0),
        min: new Array(pipe.numNodes).fill(0),
        positions: pipe.getPositionArray()
      });
    }
  }
  
  update(pipe) {
    const envelope = this.pipeEnvelopes.get(pipe.id);
    if (!envelope) {
      this.trackPipe(pipe);
      return;
    }
    
    for (let i = 0; i < pipe.numNodes; i++) {
      if (pipe.pressures[i] > envelope.max[i]) {
        envelope.max[i] = pipe.pressures[i];
      }
      if (pipe.pressures[i] < envelope.min[i]) {
        envelope.min[i] = pipe.pressures[i];
      }
    }
    
    const pipeMax = Math.max(...pipe.pressures);
    const pipeMin = Math.min(...pipe.pressures);
    
    if (pipeMax > this.globalMax) {
      this.globalMax = pipeMax;
    }
    if (pipeMin < this.globalMin) {
      this.globalMin = pipeMin;
    }
  }
  
  getPipeEnvelope(pipeId) {
    return this.pipeEnvelopes.get(pipeId);
  }
  
  getGlobalMax() {
    return this.globalMax;
  }
  
  getGlobalMin() {
    return this.globalMin;
  }
  
  getAllEnvelopes() {
    const result = {};
    this.pipeEnvelopes.forEach((value, key) => {
      result[key] = {
        positions: value.positions,
        max: value.max.map(p => p / 1e6),
        min: value.min.map(p => p / 1e6)
      };
    });
    return result;
  }
  
  exportEnvelopeData() {
    return {
      globalMax: this.globalMax / 1e6,
      globalMin: this.globalMin / 1e6,
      pipes: this.getAllEnvelopes(),
      timestamp: new Date().toISOString()
    };
  }
  
  reset() {
    this.pipeEnvelopes.clear();
    this.globalMax = 0;
    this.globalMin = 0;
  }
}

class Network {
  constructor(options = {}) {
    this.elements = new Map();
    this.pipes = [];
    this.valves = [];
    this.junctions = [];
    this.reservoirs = [];
    
    this.currentTime = 0;
    this.dt = options.dt || 0.01;
    this.simulationTime = options.simulationTime || 10;
    this.isRunning = false;
    
    this.envelopeTracker = new EnvelopeTracker();
    
    this.callbacks = {
      onStep: [],
      onComplete: []
    };
  }
  
  addElement(element) {
    this.elements.set(element.id, element);
    
    if (element instanceof Pipe) {
      this.pipes.push(element);
    } else if (element instanceof Valve) {
      this.valves.push(element);
    } else if (element instanceof Junction) {
      this.junctions.push(element);
    } else if (element instanceof Reservoir) {
      this.reservoirs.push(element);
    }
    
    this._updateTimeStep();
    
    return element;
  }
  
  removeElement(id) {
    const element = this.elements.get(id);
    if (!element) return;
    
    if (element instanceof Pipe) {
      this.pipes = this.pipes.filter(p => p.id !== id);
    } else if (element instanceof Valve) {
      this.valves = this.valves.filter(v => v.id !== id);
    } else if (element instanceof Junction) {
      this.junctions = this.junctions.filter(j => j.id !== id);
    } else if (element instanceof Reservoir) {
      this.reservoirs = this.reservoirs.filter(r => r.id !== id);
    }
    
    this.elements.delete(id);
  }
  
  getElement(id) {
    return this.elements.get(id);
  }
  
  _updateTimeStep() {
    if (this.pipes.length > 0) {
      const minDt = Math.min(...this.pipes.map(p => p.dt));
      this.dt = Math.min(this.dt, minDt);
    }
  }
  
  initialize() {
    this.currentTime = 0;
    this.envelopeTracker.reset();
    
    this.pipes.forEach(pipe => {
      pipe.initialize();
      this.envelopeTracker.trackPipe(pipe);
    });
    
    this.valves.forEach(valve => valve.computeBoundaryConditions(0));
    this.junctions.forEach(junction => junction.calculateImpedance());
  }
  
  step() {
    if (!this.isRunning) return null;
    
    this.currentTime += this.dt;
    
    this.pipes.forEach(pipe => {
      pipe.oldPressures = [...pipe.pressures];
      pipe.oldVelocities = [...pipe.velocities];
    });
    
    this.valves.forEach(valve => {
      valve.computeBoundaryConditions(this.currentTime);
    });
    
    this.junctions.forEach(junction => {
      junction.computeBoundaryConditions(this.currentTime);
    });
    
    this.pipes.forEach(pipe => {
      pipe.computeInternalNodes();
    });
    
    this._applyBoundaryConditions();
    
    this.pipes.forEach(pipe => {
      pipe.updateEnvelope();
      this.envelopeTracker.update(pipe);
    });
    
    const state = this.getState();
    
    this.callbacks.onStep.forEach(callback => callback(state));
    
    if (this.currentTime >= this.simulationTime) {
      this.stop();
      this.callbacks.onComplete.forEach(callback => callback(state));
    }
    
    return state;
  }
  
  _applyBoundaryConditions() {
    const a = this.pipes.length > 0 ? this.pipes[0].waveSpeed : 1000;
    const rho = this.pipes.length > 0 ? this.pipes[0].density : 1000;
    
    this.pipes.forEach(pipe => {
      if (this.reservoirs.length > 0) {
        const reservoirP = this.reservoirs[0].getPressure();
        pipe.pressures[0] = reservoirP;
        pipe.velocities[0] = (reservoirP - pipe.getUpstreamInvariant()) / (-rho * a);
      }
      
      if (this.valves.length > 0) {
        const valve = this.valves[0];
        const Cp = pipe.getDownstreamInvariant();
        
        if (valve.opening > 0.001) {
          const targetVelocity = pipe.initialVelocity * valve.opening;
          const valvePressure = Cp - rho * a * targetVelocity;
          
          pipe.pressures[pipe.numNodes - 1] = valvePressure;
          pipe.velocities[pipe.numNodes - 1] = targetVelocity;
        } else {
          pipe.velocities[pipe.numNodes - 1] = 0;
          pipe.pressures[pipe.numNodes - 1] = Cp;
        }
      }
    });
  }
  
  run() {
    this.isRunning = true;
    this.initialize();
    return this;
  }
  
  stop() {
    this.isRunning = false;
    return this;
  }
  
  reset() {
    this.stop();
    this.initialize();
    return this;
  }
  
  onStep(callback) {
    this.callbacks.onStep.push(callback);
    return this;
  }
  
  onComplete(callback) {
    this.callbacks.onComplete.push(callback);
    return this;
  }
  
  getState() {
    const state = {
      time: this.currentTime,
      dt: this.dt,
      isRunning: this.isRunning,
      pipes: {},
      valves: {},
      junctions: {},
      reservoirs: {},
      envelope: {
        globalMax: this.envelopeTracker.getGlobalMax() / 1e6,
        globalMin: this.envelopeTracker.getGlobalMin() / 1e6,
        globalMaxPa: this.envelopeTracker.getGlobalMax(),
        globalMinPa: this.envelopeTracker.getGlobalMin()
      }
    };
    
    this.pipes.forEach(pipe => {
      state.pipes[pipe.id] = pipe.getState();
    });
    
    this.valves.forEach(valve => {
      state.valves[valve.id] = valve.getState();
    });
    
    this.junctions.forEach(junction => {
      state.junctions[junction.id] = junction.getState();
    });
    
    this.reservoirs.forEach(reservoir => {
      state.reservoirs[reservoir.id] = reservoir.getState();
    });
    
    return state;
  }
  
  getPipeEnvelope(pipeId) {
    return this.envelopeTracker.getPipeEnvelope(pipeId);
  }
  
  exportEnvelopeData() {
    return this.envelopeTracker.exportEnvelopeData();
  }
  
  getSimulationResults() {
    return {
      time: this.currentTime,
      maxPressure: this.envelopeTracker.getGlobalMax() / 1e6,
      minPressure: this.envelopeTracker.getGlobalMin() / 1e6,
      envelopeData: this.exportEnvelopeData(),
      pipeStates: Object.fromEntries(
        this.pipes.map(p => [p.id, p.getState()])
      )
    };
  }
}

function createSimplePipeNetwork(options = {}) {
  const network = new Network(options);
  
  const pipe = new Pipe('main-pipe', {
    length: options.pipeLength || 1000,
    diameter: options.pipeDiameter || 0.5,
    waveSpeed: options.waveSpeed || 1000,
    initialVelocity: options.initialVelocity || 2,
    numNodes: options.numNodes || 100
  });
  
  const reservoir = new Reservoir('upstream-reservoir', {
    pressure: 0
  });
  
  const valve = new Valve('downstream-valve', {
    closeTime: options.valveCloseTime || 1,
    curveType: options.valveCurve || 'linear',
    initialVelocity: options.initialVelocity || 2
  });
  
  network.addElement(pipe);
  network.addElement(reservoir);
  network.addElement(valve);
  
  network.initialize();
  
  return network;
}

class WaterHammerSimulation {
  constructor(options = {}) {
    this.options = options;
    this.network = createSimplePipeNetwork(options);
    this.pipe = this.network.pipes[0];
    this.valve = this.network.valves[0];
    
    this.pipeLength = this.pipe.length;
    this.pipeDiameter = this.pipe.diameter;
    this.waveSpeed = this.pipe.waveSpeed;
    this.initialVelocity = this.pipe.initialVelocity;
    this.valveCloseTime = this.valve.closeTime;
    this.density = this.pipe.density;
    
    this.numNodes = this.pipe.numNodes;
    this.dx = this.pipe.dx;
    this.dt = this.pipe.dt;
    
    this.pressures = this.pipe.pressures;
    this.velocities = this.pipe.velocities;
    
    this.theoreticalMaxPressure = this.density * this.waveSpeed * this.initialVelocity / 1e6;
    this.waveRoundTripTime = 2 * this.pipeLength / this.waveSpeed;
  }
  
  get maxPressure() {
    return this.network.envelopeTracker.getGlobalMax();
  }
  
  get minPressure() {
    return this.network.envelopeTracker.getGlobalMin();
  }
  
  get currentTime() {
    return this.network.currentTime;
  }
  
  get isRunning() {
    return this.network.isRunning;
  }
  
  get valveOpening() {
    return this.valve.opening;
  }
  
  get pressureEnvelope() {
    return this.pipe.envelope;
  }
  
  reset() {
    this.network.reset();
    this.pressures = this.pipe.pressures;
    this.velocities = this.pipe.velocities;
  }
  
  updateParameters(options) {
    if (options.pipeLength !== undefined) {
      this.pipe.length = options.pipeLength;
      this.pipeLength = options.pipeLength;
    }
    if (options.pipeDiameter !== undefined) {
      this.pipe.diameter = options.pipeDiameter;
      this.pipeDiameter = options.pipeDiameter;
    }
    if (options.waveSpeed !== undefined) {
      this.pipe.waveSpeed = options.waveSpeed;
      this.waveSpeed = options.waveSpeed;
    }
    if (options.initialVelocity !== undefined) {
      this.pipe.initialVelocity = options.initialVelocity;
      this.initialVelocity = options.initialVelocity;
    }
    if (options.valveCloseTime !== undefined) {
      this.valve.closeTime = options.valveCloseTime;
      this.valveCloseTime = options.valveCloseTime;
    }
    if (options.valveCurve !== undefined) {
      this.valve.setCurveType(options.valveCurve);
    }
    
    this.theoreticalMaxPressure = this.density * this.waveSpeed * this.initialVelocity / 1e6;
    this.waveRoundTripTime = 2 * this.pipeLength / this.waveSpeed;
    
    this.reset();
  }
  
  setValveCurve(curveType) {
    this.valve.setCurveType(curveType);
  }
  
  addJunction(nodeIndex, branches) {
    const junction = new Junction(`junction-${nodeIndex}`, {
      density: this.density,
      waveSpeed: this.waveSpeed
    });
    
    junction.addUpstreamPipe(this.pipe);
    
    branches.forEach((branch, idx) => {
      const branchPipe = new Pipe(`branch-${idx}`, {
        length: branch.length || 500,
        diameter: branch.diameter || 0.5,
        waveSpeed: branch.waveSpeed || 1000,
        initialVelocity: this.initialVelocity / branches.length
      });
      junction.addDownstreamPipe(branchPipe);
      this.network.addElement(branchPipe);
    });
    
    this.network.addElement(junction);
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
    
    return { Z_main, Z_branches, reflectionCoefficient, transmissionCoefficient };
  }
  
  calculateValveOpening(time) {
    return this.valve.curveFunction(time, this.valve.closeTime);
  }
  
  calculateValveFlowCoefficient(opening) {
    return this.valve.Cv_max * Math.pow(opening, 1.5);
  }
  
  step() {
    const result = this.network.step();
    
    if (result) {
      this.pressures = this.pipe.pressures;
      this.velocities = this.pipe.velocities;
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
  
  getPressureData() {
    return {
      x: this.pipe.getPositionArray(),
      y: this.pressures.map(p => p / 1e6)
    };
  }
  
  getPressureEnvelope() {
    return {
      x: this.pipe.getPositionArray(),
      max: this.pipe.envelope.max.map(p => p / 1e6),
      min: this.pipe.envelope.min.map(p => p / 1e6)
    };
  }
  
  getFullSnapshot() {
    return {
      time: this.currentTime,
      maxPressure: this.getMaxPressureMPa(),
      minPressure: this.getMinPressureMPa(),
      valveOpening: this.valveOpening,
      pressureDistribution: [...this.pressures],
      velocityDistribution: [...this.velocities],
      pressureEnvelope: {
        max: [...this.pipe.envelope.max],
        min: [...this.pipe.envelope.min]
      },
      pipeParameters: {
        length: this.pipeLength,
        diameter: this.pipeDiameter,
        waveSpeed: this.waveSpeed,
        initialVelocity: this.initialVelocity,
        valveCloseTime: this.valveCloseTime,
        valveCurve: this.valve.curveType
      },
      envelopeData: this.network.exportEnvelopeData()
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
  module.exports = {
    Network,
    Pipe,
    Valve,
    Junction,
    Reservoir,
    PipeElement,
    EnvelopeTracker,
    ValveCurves,
    WaterHammerSimulation,
    createSimplePipeNetwork
  };
}
