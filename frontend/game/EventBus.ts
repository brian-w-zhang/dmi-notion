import Phaser from 'phaser';

// A shared event emitter that lets React <-> Phaser communicate
// without direct references to each other.
//
// Usage from Phaser:  EventBus.emit('agent-selected', agentData);
// Usage from React:   EventBus.on('agent-selected', handler);
export const EventBus = new Phaser.Events.EventEmitter();
