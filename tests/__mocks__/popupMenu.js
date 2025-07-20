export class PopupMenuItem {
  constructor(text, params) {
    this.connect = jest.fn();
    this.label = { text };
    this.destroy = jest.fn();
  }
}

export class PopupSeparatorMenuItem {
  constructor(text) {
    this.destroy = jest.fn();
  }
}

export class PopupSubMenuMenuItem extends PopupMenuItem {
  constructor(text, wantIcon) {
    super(text);
    this.menu = new PopupSubMenu();
  }
}

export class PopupSubMenu {
  constructor() {
    this.addMenuItem = jest.fn();
    this.removeAll = jest.fn();
  }
}

export class PopupMenuManager {
  constructor(owner, grabParams) {
    this.addMenu = jest.fn();
    this.removeMenu = jest.fn();
  }
}