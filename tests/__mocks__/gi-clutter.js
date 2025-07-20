export default {
  EVENT_STOP: true,
  EVENT_PROPAGATE: false,
  ActorAlign: {
    FILL: 'fill',
    CENTER: 'center',
    START: 'start',
    END: 'end'
  },
  ModifierType: {
    CONTROL_MASK: 1,
    SHIFT_MASK: 2,
    MOD1_MASK: 4,
    SUPER_MASK: 8
  },
  KEY_Escape: 65307,
  keyval_name: jest.fn((keyval) => `Key_${keyval}`)
};