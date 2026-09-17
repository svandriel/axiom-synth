import type { Destroyable } from './destroyable';

interface ModulationConnection {
  source: AudioNode;
  target: AudioParam;
}

export class ModulationRouter implements Destroyable {
  private readonly connections: ModulationConnection[] = [];
  private destroyed = false;

  patch(source: AudioNode, target: AudioParam): void {
    if (this.destroyed) {
      return;
    }
    if (
      this.connections.some(
        conn => conn.source === source && conn.target === target,
      )
    ) {
      return;
    }
    source.connect(target);
    this.connections.push({ source, target });
  }

  unpatch(source: AudioNode, target: AudioParam): void {
    this.removeConnection({ source, target });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.connections.forEach(({ source, target }) => {
      try {
        source.disconnect(target);
      } catch {
        // Already torn down elsewhere; teardown is best-effort.
      }
    });
    this.connections.length = 0;
  }

  private removeConnection(conn: ModulationConnection): void {
    const found = this.connections.find(
      candidate =>
        candidate.source === conn.source && candidate.target === conn.target,
    );
    if (!found) {
      return;
    }
    try {
      found.source.disconnect(found.target);
    } catch {
      // Already torn down elsewhere; teardown is best-effort.
    }
    this.connections.splice(this.connections.indexOf(found), 1);
  }
}
