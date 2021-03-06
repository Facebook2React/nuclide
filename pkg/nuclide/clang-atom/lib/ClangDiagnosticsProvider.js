'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {BusySignalProviderBase} from '../../busy-signal-provider-base';
import type {NuclideUri} from '../../remote-uri';
import type {ClangCompileResult} from '../../clang';
import type {
  FileDiagnosticMessage,
  MessageUpdateCallback,
  MessageInvalidationCallback,
} from '../../diagnostics/base';

import invariant from 'assert';
import {GRAMMAR_SET} from './constants';
import {DiagnosticsProviderBase} from '../../diagnostics/provider-base';
import {trackTiming} from '../../analytics';
import {array} from '../../commons';
import {getLogger} from '../../logging';
import {getDiagnostics} from './libclang';
import {CompositeDisposable, Range} from 'atom';

const DEFAULT_FLAGS_WARNING =
  'Diagnostics are disabled due to lack of compilation flags. ' +
  'Build this file with Buck, or create a compile_commands.json file manually.';

class ClangDiagnosticsProvider {
  _providerBase: DiagnosticsProviderBase;
  _busySignalProvider: BusySignalProviderBase;

  // Keep track of the diagnostics created by each text buffer.
  // Diagnostics will be removed once the file is closed.
  _bufferDiagnostics: WeakMap<atom$TextBuffer, Array<NuclideUri>>;
  _hasSubscription: WeakMap<atom$TextBuffer, boolean>;
  _subscriptions: atom$CompositeDisposable;

  constructor(busySignalProvider: BusySignalProviderBase) {
    const options = {
      grammarScopes: GRAMMAR_SET,
      onTextEditorEvent: this.runDiagnostics.bind(this),
      onNewUpdateSubscriber: this._receivedNewUpdateSubscriber.bind(this),
    };
    this._providerBase = new DiagnosticsProviderBase(options);
    this._busySignalProvider = busySignalProvider;

    this._bufferDiagnostics = new WeakMap();
    this._hasSubscription = new WeakMap();
    this._subscriptions = new CompositeDisposable();
  }

  runDiagnostics(editor: atom$TextEditor): void {
    this._busySignalProvider.reportBusy(
      `Clang: compiling \`${editor.getTitle()}\``,
      () => this._runDiagnosticsImpl(editor),
    );
  }

  @trackTiming('nuclide-clang-atom.fetch-diagnostics')
  async _runDiagnosticsImpl(textEditor: atom$TextEditor): Promise<void> {
    const filePath = textEditor.getPath();
    if (!filePath) {
      return;
    }

    const buffer = textEditor.getBuffer();
    if (!this._hasSubscription.get(buffer)) {
      const disposable = buffer.onDidDestroy(() => {
        this.invalidateBuffer(buffer);
        this._hasSubscription.delete(buffer);
        this._subscriptions.remove(disposable);
        disposable.dispose();
      });
      this._hasSubscription.set(buffer, true);
      this._subscriptions.add(disposable);
    }

    try {
      const diagnostics = await getDiagnostics(textEditor);
      // It's important to make sure that the buffer hasn't already been destroyed.
      if (diagnostics == null || !this._hasSubscription.get(buffer)) {
        return;
      }
      const filePathToMessages = this._processDiagnostics(diagnostics, textEditor);
      this.invalidateBuffer(buffer);
      this._providerBase.publishMessageUpdate({filePathToMessages});
      this._bufferDiagnostics.set(buffer, array.from(filePathToMessages.keys()));
    } catch (error) {
      getLogger().error(error);
    }
  }

  _processDiagnostics(
    data: ClangCompileResult,
    textEditor: atom$TextEditor,
  ): Map<NuclideUri, Array<FileDiagnosticMessage>> {
    const filePathToMessages = new Map();
    if (data.accurateFlags) {
      data.diagnostics.forEach(diagnostic => {
        // We show only warnings, errors and fatals (2, 3 and 4, respectively).
        if (diagnostic.severity < 2) {
          return;
        }

        // Clang adds file-wide errors on line -1, so we put it on line 0 instead.
        // The usual file-wide error is 'too many errors emitted, stopping now'.
        const line = Math.max(0, diagnostic.location.line);
        const col = 0;
        let range;
        if (diagnostic.ranges) {
          // Use the first range from the diagnostic as the range for Linter.
          const clangRange = diagnostic.ranges[0];
          range = new Range(
            [clangRange.start.line, clangRange.start.column],
            [clangRange.end.line, clangRange.end.column]
          );
        } else {
          let endCol = 1000;
          const buffer = textEditor.getBuffer();
          if (line <= buffer.getLastRow()) {
            endCol = buffer.lineLengthForRow(line);
          }
          range = new Range([line, col], [line, endCol]);
        }

        const {file: filePath} = diagnostic.location;
        let messages = filePathToMessages.get(filePath);
        if (messages == null) {
          messages = [];
          filePathToMessages.set(filePath, messages);
        }
        messages.push({
          scope: 'file',
          providerName: 'Clang',
          type: diagnostic.severity === 2 ? 'Warning' : 'Error',
          filePath,
          text: diagnostic.spelling,
          range,
        });
      });
    } else {
      const filePath = textEditor.getPath();
      invariant(filePath);
      filePathToMessages.set(filePath, [
        {
          scope: 'file',
          providerName: 'Clang',
          type: 'Warning',
          filePath,
          text: DEFAULT_FLAGS_WARNING,
          range: new Range([0, 0], [1, 0]),
        },
      ]);
    }

    return filePathToMessages;
  }

  invalidateBuffer(buffer: atom$TextBuffer): void {
    const filePaths = this._bufferDiagnostics.get(buffer);
    if (filePaths != null) {
      this._providerBase.publishMessageInvalidation({scope: 'file', filePaths});
    }
  }

  _receivedNewUpdateSubscriber(callback: MessageUpdateCallback): void {
    const activeTextEditor = atom.workspace.getActiveTextEditor();
    if (activeTextEditor && GRAMMAR_SET.has(activeTextEditor.getGrammar().scopeName)) {
      this.runDiagnostics(activeTextEditor);
    }
  }

  onMessageUpdate(callback: MessageUpdateCallback): IDisposable {
    return this._providerBase.onMessageUpdate(callback);
  }

  onMessageInvalidation(callback: MessageInvalidationCallback): IDisposable {
    return this._providerBase.onMessageInvalidation(callback);
  }

  dispose() {
    this._providerBase.dispose();
    this._subscriptions.dispose();
  }

}

module.exports = ClangDiagnosticsProvider;
