interface AudioParamDescriptor {
  name: string;
  automationRate?: 'a-rate' | 'k-rate';
  defaultValue?: number;
  maxValue?: number;
  minValue?: number;
}
