import { describe, it, expect } from 'vitest';

// Test the state machine logic by defining the same transitions map as in job.ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  uploaded: ['payment_pending'],
  payment_pending: ['paid', 'failed'],
  paid: ['printing'],
  printing: ['completed', 'failed'],
  completed: [],
  failed: ['paid', 'printing', 'failed_permanent'],
  failed_permanent: [],
};

const ALL_STATES = Object.keys(VALID_TRANSITIONS);

function canTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

describe('State Machine - Valid Transitions', () => {
  it('uploaded → payment_pending', () => {
    expect(canTransition('uploaded', 'payment_pending')).toBe(true);
  });

  it('payment_pending → paid', () => {
    expect(canTransition('payment_pending', 'paid')).toBe(true);
  });

  it('payment_pending → failed', () => {
    expect(canTransition('payment_pending', 'failed')).toBe(true);
  });

  it('paid → printing', () => {
    expect(canTransition('paid', 'printing')).toBe(true);
  });

  it('printing → completed', () => {
    expect(canTransition('printing', 'completed')).toBe(true);
  });

  it('printing → failed', () => {
    expect(canTransition('printing', 'failed')).toBe(true);
  });

  it('failed → paid (retry)', () => {
    expect(canTransition('failed', 'paid')).toBe(true);
  });

  it('failed → printing', () => {
    expect(canTransition('failed', 'printing')).toBe(true);
  });

  it('failed → failed_permanent', () => {
    expect(canTransition('failed', 'failed_permanent')).toBe(true);
  });
});

describe('State Machine - Invalid Transitions', () => {
  it('uploaded cannot go to paid directly', () => {
    expect(canTransition('uploaded', 'paid')).toBe(false);
  });

  it('uploaded cannot go to printing', () => {
    expect(canTransition('uploaded', 'printing')).toBe(false);
  });

  it('uploaded cannot go to completed', () => {
    expect(canTransition('uploaded', 'completed')).toBe(false);
  });

  it('uploaded cannot go to failed', () => {
    expect(canTransition('uploaded', 'failed')).toBe(false);
  });

  it('payment_pending cannot go to printing directly', () => {
    expect(canTransition('payment_pending', 'printing')).toBe(false);
  });

  it('payment_pending cannot go to completed', () => {
    expect(canTransition('payment_pending', 'completed')).toBe(false);
  });

  it('paid cannot go to completed directly', () => {
    expect(canTransition('paid', 'completed')).toBe(false);
  });

  it('paid cannot go to failed directly', () => {
    expect(canTransition('paid', 'failed')).toBe(false);
  });

  it('printing cannot go to paid', () => {
    expect(canTransition('printing', 'paid')).toBe(false);
  });

  it('completed cannot go to any state', () => {
    for (const state of ALL_STATES) {
      expect(canTransition('completed', state)).toBe(false);
    }
  });

  it('failed_permanent cannot go to any state', () => {
    for (const state of ALL_STATES) {
      expect(canTransition('failed_permanent', state)).toBe(false);
    }
  });

  it('no state can transition to uploaded', () => {
    for (const state of ALL_STATES) {
      expect(canTransition(state, 'uploaded')).toBe(false);
    }
  });
});

describe('State Machine - Terminal States', () => {
  it('completed is terminal', () => {
    expect(VALID_TRANSITIONS['completed']).toEqual([]);
  });

  it('failed_permanent is terminal', () => {
    expect(VALID_TRANSITIONS['failed_permanent']).toEqual([]);
  });

  it('non-terminal states have at least one exit', () => {
    const nonTerminal = ALL_STATES.filter(
      (s) => s !== 'completed' && s !== 'failed_permanent'
    );
    for (const state of nonTerminal) {
      expect(VALID_TRANSITIONS[state].length).toBeGreaterThan(0);
    }
  });
});

describe('State Machine - Complete Paths', () => {
  it('happy path: uploaded → payment_pending → paid → printing → completed', () => {
    const path = ['uploaded', 'payment_pending', 'paid', 'printing', 'completed'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('retry path: ... → printing → failed → paid → printing → completed', () => {
    const path = [
      'uploaded', 'payment_pending', 'paid', 'printing',
      'failed', 'paid', 'printing', 'completed',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('permanent failure path: ... → printing → failed → failed_permanent', () => {
    const path = [
      'uploaded', 'payment_pending', 'paid', 'printing',
      'failed', 'failed_permanent',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('payment failure path: ... → payment_pending → failed', () => {
    const path = ['uploaded', 'payment_pending', 'failed'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('retry after payment failure: ... → payment_pending → failed → paid → printing → completed', () => {
    const path = [
      'uploaded', 'payment_pending', 'failed',
      'paid', 'printing', 'completed',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });
});

describe('State Machine - Self Transitions', () => {
  it('no state allows self-transition', () => {
    for (const state of ALL_STATES) {
      expect(canTransition(state, state)).toBe(false);
    }
  });
});

describe('State Machine - Unknown State', () => {
  it('unknown state has no valid transitions', () => {
    expect(canTransition('nonexistent', 'paid')).toBe(false);
  });
});
