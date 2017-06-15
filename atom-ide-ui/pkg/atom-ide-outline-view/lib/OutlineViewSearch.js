/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import React from 'react';
import {AtomInput} from 'nuclide-commons-ui/AtomInput';
import {Icon} from 'nuclide-commons-ui/Icon';
import {goToLocationInEditor} from 'nuclide-commons-atom/go-to-location';
import debounce from 'nuclide-commons/debounce';
import analytics from 'nuclide-commons-atom/analytics';

import fuzzaldrinPlus from 'fuzzaldrin-plus';
import type {OutlineTreeForUi} from './main';

export type SearchResult = {
  matches: boolean,
  visible: boolean,
};

type Props = {
  editor: atom$TextEditor,
  outlineTrees: Array<OutlineTreeForUi>,
  updateSearchResults: (
    searchResults: Map<OutlineTreeForUi, SearchResult>,
  ) => void,
};

type State = {
  currentQuery: string,
};

export class OutlineViewSearchComponent extends React.Component {
  searchResults: Map<OutlineTreeForUi, SearchResult>;
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    // An element is considered visible if it is not in the Map or if it has a
    // Search result that has the visible property set to true. Therefore, all
    // elements are visible when the Map is empty.
    this.searchResults = new Map();
    this.state = {
      currentQuery: '',
    };
  }

  SEARCH_PLACEHOLDER = 'Search Outline View';
  DEBOUNCE_TIME = 100;

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (prevState.currentQuery === '' && this.state.currentQuery === '') {
      return;
    }
    if (this.state.currentQuery === '') {
      this.props.updateSearchResults(new Map());
      return;
    }
    if (prevProps.editor !== this.props.editor) {
      this.setState({currentQuery: ''});
      return;
    }
    if (
      prevState.currentQuery !== this.state.currentQuery ||
      prevProps.outlineTrees !== this.props.outlineTrees
    ) {
      const newMap = new Map();
      this.props.outlineTrees.forEach(root =>
        updateSearchSet(
          this.state.currentQuery,
          root,
          newMap,
          this.searchResults,
          prevState.currentQuery,
        ),
      );
      this.searchResults = newMap;
      this.props.updateSearchResults(this.searchResults);
    }
  }

  _findFirstResult(
    searchResults: Map<OutlineTreeForUi, SearchResult>,
    tree: Array<OutlineTreeForUi>,
  ): ?OutlineTreeForUi {
    for (let i = 0; i < tree.length; i++) {
      const result = searchResults.get(tree[i]);
      if (result && result.matches) {
        return tree[i];
      }
      const child = this._findFirstResult(searchResults, tree[i].children);
      if (child) {
        return child;
      }
    }
  }

  _onConfirm = () => {
    const firstElement = this._findFirstResult(
      this.searchResults,
      this.props.outlineTrees,
    );
    if (firstElement == null) {
      return;
    }
    const pane = atom.workspace.paneForItem(this.props.editor);
    if (pane == null) {
      return;
    }
    analytics.track('atom-ide-outline-view:search-enter');
    pane.activate();
    pane.activateItem(this.props.editor);
    goToLocationInEditor(
      this.props.editor,
      firstElement.startPosition.row,
      firstElement.startPosition.column,
    );
    this.setState({currentQuery: ''});
  };

  _onDidChange = debounce(query => {
    this.setState({currentQuery: query});
  }, this.DEBOUNCE_TIME);

  render(): React.Element<any> {
    return (
      <div className="atom-ide-outline-view-search-bar">
        <Icon icon="search" className="atom-ide-outline-view-search-icon" />
        <AtomInput
          className="atom-ide-outline-view-search-pane"
          onConfirm={this._onConfirm}
          onDidChange={this._onDidChange}
          placeholderText={this.state.currentQuery || this.SEARCH_PLACEHOLDER}
          value={this.state.currentQuery}
        />
      </div>
    );
  }
}

/* Exported for testing */
export function updateSearchSet(
  query: string,
  root: OutlineTreeForUi,
  map: Map<OutlineTreeForUi, SearchResult>,
  prevMap: Map<OutlineTreeForUi, SearchResult>,
  prevQuery: ?string,
): void {
  root.children.forEach(child =>
    updateSearchSet(query, child, map, prevMap, prevQuery),
  );
  // Optimization using results from previous query.
  if (prevQuery) {
    const previousResult = prevMap.get(root);
    if (
      previousResult &&
      (query === prevQuery ||
        (query.startsWith(prevQuery) && !previousResult.visible))
    ) {
      map.set(root, previousResult);
      return;
    }
  }
  const matches =
    query === '' ||
    fuzzaldrinPlus.score(
      root.tokenizedText
        ? root.tokenizedText.map(e => e.value).join('')
        : root.plainText || '',
      query,
    ) > 0;
  const visible =
    matches ||
    Boolean(
      root.children.find(child => {
        const childResult = map.get(child);
        return !childResult || childResult.visible;
      }),
    );
  map.set(root, {matches, visible});
}
