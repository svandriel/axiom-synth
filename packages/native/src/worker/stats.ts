export class Statistics {
  private total = 0;
  private sampleCount = 0;

  public addSample(sample: number): void {
    this.total += sample;
    this.sampleCount++;
  }

  get count(): number {
    return this.sampleCount;
  }

  public clear() {
    this.total = 0;
    this.sampleCount = 0;
  }

  get average(): number {
    if (this.sampleCount === 0) {
      return 0;
    }
    return this.total / this.sampleCount;
  }
}
