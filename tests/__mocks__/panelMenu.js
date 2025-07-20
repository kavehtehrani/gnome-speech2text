export class Button {
  constructor(menuAlignment, nameText, dontCreateMenu) {
    this.menu = {
      addMenuItem: jest.fn(),
      removeAll: jest.fn(),
    };
    this.connect = jest.fn();
    this.disconnect = jest.fn();
    this.destroy = jest.fn();
    this.add_child = jest.fn();
    this.remove_child = jest.fn();
  }
}

export class SystemIndicator extends Button {}