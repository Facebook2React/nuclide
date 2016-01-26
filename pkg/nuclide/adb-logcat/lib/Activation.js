'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {CompositeDisposable} from 'atom';

class Activation {
  _disposables: CompositeDisposable;

  constructor(state: ?Object) {
    // TODO(matthewwithanm): Assign all fields here so they are
    // non-nullable for the lifetime of Activation.
    this._disposables = new CompositeDisposable();
  }

  dispose() {
    this._disposables.dispose();
  }
}

module.exports = Activation;