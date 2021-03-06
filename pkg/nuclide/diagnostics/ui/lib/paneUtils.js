'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {DiagnosticMessage} from '../../base';

function fileOfDiagnosticMessage(diagnostic: DiagnosticMessage): string {
  if (diagnostic.filePath != null) {
    return diagnostic.filePath;
  } else {
    return '';
  }
}

function getProjectRelativePathOfDiagnostic(diagnostic: DiagnosticMessage): string {
  if (diagnostic.filePath != null) {
    const [, relativePath] = atom.project.relativizePath(diagnostic.filePath);
    return relativePath;
  } else {
    return '';
  }
}

function fileColumnCellDataGetter(cellDataKey: 'filePath', diagnostic: DiagnosticMessage): string {
  return getProjectRelativePathOfDiagnostic(diagnostic);
}

function compareMessagesByFile(a: DiagnosticMessage, b: DiagnosticMessage): number {
  // This will sort by:
  //  - local before remote
  //  - Remote machine name/port
  //  - full path
  //
  // We don't sort by project relative path as that will interleave diagnostics from
  // different projects.
  let compareVal = fileOfDiagnosticMessage(a).localeCompare(fileOfDiagnosticMessage(b));
  // If the messages are from the same file (`filePath` is equal and `localeCompare`
  // returns 0), compare the line numbers within the file to determine their sort order.
  if (compareVal === 0 && (a.range !== undefined && b.range !== undefined)) {
    compareVal = a.range.start.row - b.range.start.row;
  }

  return compareVal;
}

module.exports = {
  compareMessagesByFile,
  getProjectRelativePathOfDiagnostic,
  fileColumnCellDataGetter,
};
