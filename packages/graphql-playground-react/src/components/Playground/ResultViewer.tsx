/**
 *  Copyright (c) Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the license found in the
 *  LICENSE file in the root directory of this source tree.
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { styled, withProps } from '../../styled'

import { parse } from 'graphql'

export interface Props {
  schema?: any
  query?: any
  value: string
  isSubscription: boolean
  hideGutters?: boolean
  tooltip?: any
}

/**
 * ResultViewer
 *
 * Maintains an instance of CodeMirror for viewing a GraphQL response.
 *
 * Props:
 *
 *   - value: The text of the editor.
 *
 */
export class ResultViewer extends React.Component<Props, {}> {
  private node: any
  private viewer: any

  componentDidMount() {
    const CodeMirror = require('codemirror')
    require('codemirror/addon/fold/foldgutter')
    require('codemirror/addon/fold/brace-fold')
    require('codemirror/addon/dialog/dialog')
    require('codemirror/addon/search/search')
    require('codemirror/addon/search/searchcursor')
    require('codemirror/addon/search/jump-to-line')
    require('codemirror/keymap/sublime')
    require('codemirror-graphql/results/mode')

    if (this.props.tooltip) {
      require('codemirror-graphql/utils/info-addon')
      const tooltipDiv = document.createElement('div')
      CodeMirror.registerHelper(
        'info',
        'graphql-results',
        (token, options, cm, pos) => {
          const type = null
          const value = null

          const Tooltip = this.props.tooltip
          ReactDOM.render(<Tooltip value={value} type={type} />, tooltipDiv)
          return tooltipDiv
        },
      )
    }

    const gutters: any[] = []
    if (!this.props.hideGutters) {
      gutters.push('CodeMirror-foldgutter')
    }
    let foldGutter: any = {}
    if (!this.props.hideGutters) {
      foldGutter = {
        minFoldSize: 4,
      }
    }

    const value = this.props.value || ''

    this.viewer = CodeMirror(this.node, {
      lineWrapping: true,
      value,
      readOnly: true,
      theme: 'graphiql',
      mode: 'graphql-results',
      keyMap: 'sublime',
      foldGutter,
      gutters,
      info: Boolean(this.props.tooltip),
      extraKeys: {
        // Persistent search box in Query Editor
        'Cmd-F': 'findPersistent',
        'Ctrl-F': 'findPersistent',

        // Editor improvements
        'Ctrl-Left': 'goSubwordLeft',
        'Ctrl-Right': 'goSubwordRight',
        'Alt-Left': 'goGroupLeft',
        'Alt-Right': 'goGroupRight',
      },
    })
  }

  shouldComponentUpdate(nextProps) {
    return this.props.value !== nextProps.value
  }

  componentDidUpdate() {
    const value = this.props.value || ''
    this.viewer.setValue(value)
  }

  componentWillUnmount() {
    this.viewer = null
  }

  render() {
    return (
      <Result
        innerRef={this.setRef}
        isSubscription={this.props.isSubscription}
      />
    )
  }

  setRef = ref => {
    this.node = ref
  }

  /**
   * Public API for retrieving the CodeMirror instance from this
   * React component.
   */
  getCodeMirror() {
    return this.viewer
  }

  /**
   * Public API for retrieving the DOM client height for this component.
   */
  getClientHeight() {
    return this.node && this.node.clientHeight
  }

  buildTypeMap(schema, query) {
    const typeMap = new Map()

    query = parse(query)
    for (const definition of query.definitions) {
      for (const selection of definition.selectionSet.selections) {
        this.findTypes(typeMap, [], schema, selection)
      }
    }

    return typeMap
  }

  findTypes(typeMap, path, schema, selection) {
    path.push({ name: selection.name.value })

    const name = selection.alias ? selection.alias.value : selection.name.value

    if (selection.selectionSet) {
      typeMap.set(name, new Map())

      for (const subselection of selection.selectionSet.selections) {
        this.findTypes(typeMap.get(name), path.slice(0), schema, subselection)
      }
    } else {
      typeMap.set(name, this.findTypeFromSchema(path.slice(0), schema))
    }
  }

  findTypeFromSchema(path, schema) {
    let current = path.shift()
    let fields = Object.values(schema._queryType._fields)

    while (1) {
      const field: any = fields.shift()
      if (!field) {
        return null
      }

      if (field.name === current.name) {
        const type = field.type.ofType ? field.type.ofType : field.type

        if (path.length === 0) {
          return type.name
        } else if (
          type._fields ||
          type.ofType._fields ||
          type.ofType.ofType._fields
        ) {
          fields = type._fields
            ? Object.values(type._fields)
            : type.ofType._fields
              ? Object.values(type.ofType._fields)
              : Object.values(type.ofType.ofType._fields)
          current = path.shift()
        } else {
          return null
        }
      }
    }
  }
}

interface ResultProps {
  isSubscription: boolean
}

const Result = withProps<ResultProps>()(styled.div)`
  position: relative;
  display: flex;
  flex: 1;
  height: ${props => (props.isSubscription ? 'auto' : '100%')};
  .CodeMirror {
    height: ${props => (props.isSubscription ? 'auto' : '100%')};
    position: ${props => (props.isSubscription ? 'relative' : 'absolute%')};
    box-sizing: border-box;
    background: none;
    padding-left: 38px;
  }
  .CodeMirror-scroll {
    overflow: auto !important;
    max-width: 50vw;
    margin-right: 10px;
  }
  .cm-string {
    color: ${p => p.theme.editorColours.property} !important;
  }
`
