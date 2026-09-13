export class Observable<T> {
  private _value: T;
  private subscribers: ((newValue: T) => void)[] = [];

  constructor(value: T) {
    this._value = value;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    if (this._value === newValue) {
      return;
    }
    this._value = newValue;
    this.subscribers.forEach(callback => callback(newValue));
  }

  subscribe(callback: (newValue: T) => void): { unsubscribe: () => void } {
    this.subscribers.push(callback);
    return {
      unsubscribe: () => {
        this.subscribers = this.subscribers.filter(sub => sub !== callback);
      },
    };
  }
}
