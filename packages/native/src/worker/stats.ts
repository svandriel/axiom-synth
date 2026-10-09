export class Statistics {
  private samples: number[] = [];

  public addSample(sample: number): void {
    this.samples.push(sample);
  }

  public getSamples(): number[] {
    return this.samples;
  }

  get count(): number {
    return this.samples.length;
  }

  public clear() {
    this.samples = [];
  }

  get average(): number {
    if (this.samples.length === 0) {
      return 0;
    }
    const sum = this.samples.reduce((acc, val) => acc + val, 0);
    return sum / this.samples.length;
  }
}
