import { describe, it, expect } from 'vitest';

// Test queue logic as pure functions (mirrors queue.ts patterns)

class PrintQueue {
  private queue: string[] = [];
  private processing = false;

  enqueue(jobId: string): void {
    this.queue.push(jobId);
  }

  dequeue(): string | undefined {
    return this.queue.shift();
  }

  startProcessing(): void {
    this.processing = true;
  }

  stopProcessing(): void {
    this.processing = false;
  }

  getPosition(jobId: string): number | null {
    const idx = this.queue.indexOf(jobId);
    if (idx >= 0) return idx + 1;
    return null;
  }

  getDepth(): number {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  getEstimatedWaitMinutes(avgJobSeconds: number = 30): number {
    return Math.ceil((this.getDepth() * avgJobSeconds) / 60);
  }

  getQueuedJobIds(): string[] {
    return [...this.queue];
  }

  get length(): number {
    return this.queue.length;
  }
}

describe('Queue - Enqueue/Dequeue', () => {
  it('starts empty', () => {
    const q = new PrintQueue();
    expect(q.length).toBe(0);
  });

  it('enqueue adds item', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    expect(q.length).toBe(1);
  });

  it('enqueue multiple items', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    q.enqueue('job3');
    expect(q.length).toBe(3);
  });

  it('dequeue removes first item (FIFO)', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    expect(q.dequeue()).toBe('job1');
    expect(q.length).toBe(1);
  });

  it('dequeue on empty returns undefined', () => {
    const q = new PrintQueue();
    expect(q.dequeue()).toBeUndefined();
  });

  it('dequeue all items empties queue', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    q.dequeue();
    q.dequeue();
    expect(q.length).toBe(0);
  });
});

describe('Queue - Position', () => {
  it('position in empty queue is null', () => {
    const q = new PrintQueue();
    expect(q.getPosition('job1')).toBeNull();
  });

  it('first item has position 1', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    expect(q.getPosition('job1')).toBe(1);
  });

  it('second item has position 2', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    expect(q.getPosition('job2')).toBe(2);
  });

  it('position after dequeue shifts', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    q.enqueue('job3');
    q.dequeue(); // remove job1
    expect(q.getPosition('job2')).toBe(1);
    expect(q.getPosition('job3')).toBe(2);
  });

  it('dequeued item position is null', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.dequeue();
    expect(q.getPosition('job1')).toBeNull();
  });

  it('non-existent job position is null', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    expect(q.getPosition('job_nonexistent')).toBeNull();
  });
});

describe('Queue - Depth', () => {
  it('empty queue depth is 0', () => {
    const q = new PrintQueue();
    expect(q.getDepth()).toBe(0);
  });

  it('depth counts queued items', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    expect(q.getDepth()).toBe(2);
  });

  it('depth includes processing job', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.startProcessing();
    expect(q.getDepth()).toBe(2); // 1 queued + 1 processing
  });

  it('depth without processing', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    expect(q.getDepth()).toBe(2);
  });

  it('depth after stop processing', () => {
    const q = new PrintQueue();
    q.startProcessing();
    expect(q.getDepth()).toBe(1);
    q.stopProcessing();
    expect(q.getDepth()).toBe(0);
  });
});

describe('Queue - Estimated Wait', () => {
  it('empty queue wait is 0 minutes', () => {
    const q = new PrintQueue();
    expect(q.getEstimatedWaitMinutes()).toBe(0);
  });

  it('single job wait is 1 minute (30s avg)', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    expect(q.getEstimatedWaitMinutes(30)).toBe(1); // ceil(30/60) = 1
  });

  it('two jobs wait is 1 minute (30s avg)', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    expect(q.getEstimatedWaitMinutes(30)).toBe(1); // ceil(60/60) = 1
  });

  it('three jobs wait is 2 minutes (30s avg)', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    q.enqueue('job3');
    expect(q.getEstimatedWaitMinutes(30)).toBe(2); // ceil(90/60) = 2
  });

  it('includes processing job in estimate', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.startProcessing();
    expect(q.getEstimatedWaitMinutes(60)).toBe(2); // depth=2, ceil(120/60)=2
  });
});

describe('Queue - getQueuedJobIds', () => {
  it('returns empty array for empty queue', () => {
    const q = new PrintQueue();
    expect(q.getQueuedJobIds()).toEqual([]);
  });

  it('returns copy, not reference', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    const ids = q.getQueuedJobIds();
    ids.push('job2');
    expect(q.length).toBe(1); // original not modified
  });

  it('returns items in order', () => {
    const q = new PrintQueue();
    q.enqueue('job1');
    q.enqueue('job2');
    q.enqueue('job3');
    expect(q.getQueuedJobIds()).toEqual(['job1', 'job2', 'job3']);
  });
});
