/**
 *  Copyright (c) Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the license found in the
 *  LICENSE file in the root directory of this source tree.
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { styled } from '../../styled'
import { mergeMap } from './util/mergeMap'

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

  private typeMap: any

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
          const path: any[] = []
          let state = token.state
          while (state.prevState) {
            if (state.kind === 'ObjectField') {
              path.push(state.name.replace(/\"/g, ''))
            }
            state = state.prevState
          }

          let type

          if (this.typeMap) {
            let current = path.pop()
            let map = this.typeMap
            while (path.length > 0) {
              map = map.get(current)
              current = path.pop()
            }
            type = map.get(current)

            if (Array.isArray(type)) {
              if (type => type.every(e => e === type[0])) {
                type = type[0]
              }
            }
          }

          const value = token.string

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
    return (
      this.props.value !== nextProps.value ||
      this.props.query !== nextProps.query
    )
  }

  componentDidUpdate() {
    if (this.props.query) {
      this.typeMap = this.buildTypeMap(this.props.schema, this.props.query)
    }

    const value = this.props.value || ''
    this.viewer.setValue(value)
  }

  componentWillUnmount() {
    this.viewer = null
  }

  render() {
    return (
      <Result ref={this.setRef} isSubscription={this.props.isSubscription} />
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
    let typeMap = new Map()
    let fragmentMap = new Map()

    query = parse(query)
    for (const definition of query.definitions) {
      if (definition.kind !== 'FragmentDefinition') {
        continue
      }

      fragmentMap.set(definition.name.value, new Map())
      for (const selection of definition.selectionSet.selections) {
        fragmentMap.set(
          definition.name.value,
          this.findFragmentTypes(
            fragmentMap.get(definition.name.value),
            definition.typeCondition.name.value,
            schema,
            [],
            selection,
          ),
        )
      }
    }

    fragmentMap = this.fixNestedFragments(fragmentMap)

    for (const definition of query.definitions) {
      if (definition.kind !== 'OperationDefinition') {
        continue
      }
      for (const selection of definition.selectionSet.selections) {
        typeMap = this.findTypes(typeMap, fragmentMap, [], schema, selection)
      }
    }

    return typeMap
  }

  fixNestedFragments(fragmentMap) {
    const fixedFragments = new Map()

    while (fixedFragments.size !== fragmentMap.size) {
      for (const key of Array.from(fragmentMap.keys())) {
        const result = this.fixFragment(fixedFragments, fragmentMap.get(key))
        fragmentMap.set(key, result.map)

        if (result.fixed) {
          fixedFragments.set(key, result.map)
        }
      }
    }

    return fixedFragments
  }

  fixFragment(fixedFragments, subMap) {
    let fixed = 1
    let fixedMap = new Map()

    for (const key of Array.from(subMap.keys())) {
      const value = subMap.get(key)

      if (value instanceof Map) {
        const result = this.fixFragment(fixedFragments, value)
        if (!result.fixed) {
          fixed = 0
        }
        fixedMap.set(key, result.map)
      } else if (!value) {
        if (fixedFragments.has(key)) {
          fixedMap = mergeMap(fixedMap, fixedFragments.get(key))
        } else {
          fixedMap.set(key, null)
          fixed = 0
        }
      } else {
        if (fixedMap.has(key)) {
          // Fixed map can already have a value for the key if a nested fragment with same key was processed earlier
          const currentValue = fixedMap.get(key)
          if (Array.isArray(currentValue)) {
            currentValue.push(value)
            fixedMap.set(key, currentValue)
          } else {
            fixedMap.set(key, [currentValue, value])
          }
        } else {
          fixedMap.set(key, value)
        }
      }
    }

    return { fixed, map: fixedMap }
  }

  findFragmentTypes(outputMap, type, schema, path, selection) {
    if (selection.kind === 'InlineFragment') {
      let inlineFragmentMap = new Map()

      for (const subselection of selection.selectionSet.selections) {
        inlineFragmentMap = mergeMap(
          inlineFragmentMap,
          this.findFragmentTypes(
            new Map(inlineFragmentMap),
            selection.typeCondition.name.value,
            schema,
            [],
            subselection,
          ),
        )
      }

      outputMap = mergeMap(outputMap, inlineFragmentMap)
      return outputMap
    }

    path.push({ name: selection.name.value })

    const name = selection.alias ? selection.alias.value : selection.name.value

    if (selection.selectionSet) {
      outputMap.set(name, new Map())

      for (const subselection of selection.selectionSet.selections) {
        outputMap.set(
          name,
          this.findFragmentTypes(
            outputMap.get(name),
            type,
            schema,
            path.slice(0),
            subselection,
          ),
        )
      }
    } else {
      outputMap.set(
        name,
        this.findTypeFromFragment(type, path.slice(0), schema),
      )
    }

    return outputMap
  }

  findTypeFromFragment(type, path, schema) {
    let current = path.shift()
    let fields

    for (const graphQLType of Object.values(schema._typeMap)) {
      if ((graphQLType as any).name === type) {
        fields = Object.values((graphQLType as any)._fields)
        break
      }
    }

    if (!fields) {
      return null
    }

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

  findTypes(typeMap, fragmentMap, path, schema, selection) {
    if (selection.kind === 'InlineFragment') {
      let inlineFragmentMap = new Map()

      for (const subselection of selection.selectionSet.selections) {
        inlineFragmentMap = mergeMap(
          inlineFragmentMap,
          this.findFragmentTypes(
            new Map(inlineFragmentMap),
            selection.typeCondition.name.value,
            schema,
            [],
            subselection,
          ),
        )
      }

      return mergeMap(typeMap, inlineFragmentMap)
    }

    path.push({ name: selection.name.value })

    const name = selection.alias ? selection.alias.value : selection.name.value

    if (selection.selectionSet) {
      typeMap.set(name, new Map())

      for (const subselection of selection.selectionSet.selections) {
        typeMap.set(
          name,
          this.findTypes(
            typeMap.get(name),
            fragmentMap,
            path.slice(0),
            schema,
            subselection,
          ),
        )
      }
    } else if (selection.kind === 'FragmentSpread') {
      typeMap = mergeMap(typeMap, fragmentMap.get(selection.name.value))
    } else {
      typeMap.set(name, this.findTypeFromSchema(path.slice(0), schema))
    }

    return typeMap
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

const Result = styled<ResultProps, 'div'>('div')`
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
  .CodeMirror-cursor {
    display: none !important;
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
