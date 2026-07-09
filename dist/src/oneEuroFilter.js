export class LowPassFilter {
  constructor() {
    this.initialized = false;
    this.previous = 0;
  }

  filter(value, alpha) {
    if (!this.initialized) {
      this.initialized = true;
      this.previous = value;
      return value;
    }
    const filtered = alpha * value + (1 - alpha) * this.previous;
    this.previous = filtered;
    return filtered;
  }
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.035, derivativeCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.valueFilter = new LowPassFilter();
    this.derivativeFilter = new LowPassFilter();
    this.lastTimestamp = null;
    this.lastRaw = null;
  }

  alpha(cutoff, frequency) {
    const tau = 1 / (2 * Math.PI * cutoff);
    const te = 1 / Math.max(0.001, frequency);
    return 1 / (1 + tau / te);
  }

  filter(value, timestamp) {
    const frequency = this.lastTimestamp === null ? 30 : 1 / Math.max(0.001, timestamp - this.lastTimestamp);
    const derivative = this.lastRaw === null ? 0 : (value - this.lastRaw) * frequency;
    const filteredDerivative = this.derivativeFilter.filter(derivative, this.alpha(this.derivativeCutoff, frequency));
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);
    const result = this.valueFilter.filter(value, this.alpha(cutoff, frequency));
    this.lastTimestamp = timestamp;
    this.lastRaw = value;
    return result;
  }
}

export class KeypointSmoother {
  constructor() {
    this.filters = new Map();
  }

  smooth(trackId, keypoints, timestamp) {
    return keypoints.map((keypoint) => {
      const base = `${trackId}:${keypoint.name}`;
      if (!this.filters.has(base)) {
        this.filters.set(base, {
          x: new OneEuroFilter(),
          y: new OneEuroFilter(),
        });
      }
      const filters = this.filters.get(base);
      return {
        ...keypoint,
        x: filters.x.filter(keypoint.x, timestamp),
        y: filters.y.filter(keypoint.y, timestamp),
      };
    });
  }
}
