import { getEventKey, getNativeEvent, isModifierKey, type EventKeyMap } from "@zag-js/dom-event"
import { contains, dataAttr, getEventTarget } from "@zag-js/dom-query"
import type { NormalizeProps, PropTypes } from "@zag-js/types"
import { parts } from "./tree-view.anatomy"
import { dom } from "./tree-view.dom"
import type { BranchProps, BranchState, ItemProps, ItemState, MachineApi, Send, State } from "./tree-view.types"

export function connect<T extends PropTypes>(state: State, send: Send, normalize: NormalizeProps<T>): MachineApi<T> {
  const expandedValue = state.context.expandedValue
  const selectedValue = state.context.selectedValue
  const isTypingAhead = state.context.isTypingAhead
  const focusedValue = state.context.focusedValue

  function getItemState(props: ItemProps): ItemState {
    return {
      value: props.value,
      isDisabled: Boolean(props.disabled),
      isFocused: focusedValue === props.value,
      isSelected: selectedValue.includes(props.value),
    }
  }

  function getBranchState(props: BranchProps): BranchState {
    return {
      value: props.value,
      isDisabled: Boolean(props.disabled),
      isFocused: focusedValue === props.value,
      isExpanded: expandedValue.includes(props.value),
      isSelected: selectedValue.includes(props.value),
    }
  }

  return {
    expandedValue: expandedValue,
    selectedValue: selectedValue,
    expand(value) {
      if (!value) {
        send({ type: "EXPANDED.ALL" })
        return
      }
      const nextValue = new Set(expandedValue)
      value.forEach((id) => nextValue.add(id))
      send({ type: "EXPANDED.SET", value: nextValue, src: "expand" })
    },
    collapse(value) {
      if (!value) {
        send({ type: "EXPANDED.SET", value: new Set([]), src: "collapseAll" })
        return
      }
      const nextValue = new Set(expandedValue)
      value.forEach((id) => nextValue.delete(id))
      send({ type: "EXPANDED.SET", value: nextValue, src: "collapse" })
    },
    deselect(value) {
      if (!value) {
        send({ type: "SELECTED.SET", value: new Set([]), src: "deselectAll" })
        return
      }
      const nextValue = new Set(selectedValue)
      value.forEach((id) => nextValue.delete(id))
      send({ type: "SELECTED.SET", value: nextValue, src: "deselect" })
    },
    select(value) {
      if (!value) {
        send({ type: "SELECTED.ALL" })
        return
      }
      const nextValue = new Set(selectedValue)
      value.forEach((id) => nextValue.add(id))
      send({ type: "SELECTED.SET", value: nextValue, src: "select" })
    },
    focusBranch(id) {
      dom.getBranchControlEl(state.context, id)?.focus()
    },
    focusItem(id) {
      dom.getItemEl(state.context, id)?.focus()
    },

    rootProps: normalize.element({
      ...parts.root.attrs,
      id: dom.getRootId(state.context),
      dir: state.context.dir,
    }),

    labelProps: normalize.element({
      ...parts.label.attrs,
      id: dom.getLabelId(state.context),
      dir: state.context.dir,
    }),

    treeProps: normalize.element({
      ...parts.tree.attrs,
      id: dom.getTreeId(state.context),
      dir: state.context.dir,
      role: "tree",
      "aria-label": "Tree View",
      "aria-labelledby": dom.getLabelId(state.context),
      "aria-multiselectable": state.context.selectionMode === "multiple" || undefined,
      onKeyDown(event) {
        if (event.defaultPrevented) return
        const evt = getNativeEvent(event)
        if (evt.isComposing) return

        const target = getEventTarget<HTMLElement>(evt)

        const node = target?.closest<HTMLElement>("[role=treeitem]")
        if (!node) return

        const nodeId = dom.getNodeId(node)
        if (nodeId == null) {
          console.warn(`Node id not found for node`, node)
          return
        }

        const isBranchNode = !!target?.dataset.branch

        const keyMap: EventKeyMap = {
          ArrowDown(event) {
            if (isModifierKey(event)) return
            event.preventDefault()
            send({ type: "ITEM.ARROW_DOWN", id: nodeId, shiftKey: event.shiftKey })
          },
          ArrowUp(event) {
            if (isModifierKey(event)) return
            event.preventDefault()
            send({ type: "ITEM.ARROW_UP", id: nodeId, shiftKey: event.shiftKey })
          },
          ArrowLeft(event) {
            if (isModifierKey(event) || node.dataset.disabled) return
            event.preventDefault()
            send({ type: isBranchNode ? "BRANCH.ARROW_LEFT" : "ITEM.ARROW_LEFT", id: nodeId })
          },
          ArrowRight(event) {
            if (!isBranchNode || node.dataset.disabled) return
            event.preventDefault()
            send({ type: "BRANCH.ARROW_RIGHT", id: nodeId })
          },
          Home(event) {
            if (isModifierKey(event)) return
            event.preventDefault()
            send({ type: "ITEM.HOME", id: nodeId, shiftKey: event.shiftKey })
          },
          End(event) {
            if (isModifierKey(event)) return
            event.preventDefault()
            send({ type: "ITEM.END", id: nodeId, shiftKey: event.shiftKey })
          },
          Space(event) {
            if (node.dataset.disabled) return

            if (isTypingAhead) {
              send({ type: "TREE.TYPEAHEAD", key: event.key })
            } else {
              keyMap.Enter?.(event)
            }
          },
          Enter(event) {
            if (node.dataset.disabled) return

            const isLink = target?.closest("a[href]")
            if (!isLink) event.preventDefault()

            send({ type: isBranchNode ? "BRANCH.CLICK" : "ITEM.CLICK", id: nodeId, src: "keyboard" })
          },
          "*"(event) {
            if (node.dataset.disabled) return
            event.preventDefault()
            send({ type: "EXPAND.SIBLINGS", id: nodeId })
          },
          a(event) {
            if (!event.metaKey || node.dataset.disabled) return
            event.preventDefault()
            send({ type: "SELECTED.ALL", preventScroll: true, moveFocus: true })
          },
        }

        const key = getEventKey(event, state.context)
        const exec = keyMap[key]

        if (exec) {
          exec(event)
          return
        }

        if (!state.context.typeahead) return

        const isValidTypeahead = event.key.length === 1 && !isModifierKey(event)
        if (!isValidTypeahead) return

        send({ type: "TREE.TYPEAHEAD", key: event.key, id: nodeId })
        event.preventDefault()
      },
      onBlur(event) {
        if (contains(event.currentTarget, event.relatedTarget)) return
        send({ type: "TREE.BLUR" })
      },
    }),

    getItemState,
    getItemProps(props) {
      const itemState = getItemState(props)
      return normalize.element({
        ...parts.item.attrs,
        dir: state.context.dir,
        "data-ownedby": dom.getTreeId(state.context),
        "data-item": itemState.value,
        tabIndex: itemState.isFocused ? 0 : -1,
        "data-focused": dataAttr(itemState.isFocused),
        role: "treeitem",
        "aria-current": itemState.isSelected ? "true" : undefined,
        "aria-selected": itemState.isDisabled ? undefined : itemState.isSelected,
        "data-selected": dataAttr(itemState.isSelected),
        "aria-disabled": itemState.isDisabled,
        "data-disabled": dataAttr(itemState.isDisabled),
        "aria-level": props.depth,
        "data-depth": props.depth,
        style: {
          "--depth": props.depth,
        },
        onFocus(event) {
          event.stopPropagation()
          send({ type: "ITEM.FOCUS", id: itemState.value })
        },
        onClick(event) {
          if (itemState.isDisabled) return
          const isMetaKey = event.metaKey || event.ctrlKey
          send({ type: "ITEM.CLICK", id: itemState.value, shiftKey: event.shiftKey, ctrlKey: isMetaKey })
          event.stopPropagation()

          const isLink = event.currentTarget.matches("a[href]")
          if (!isLink) event.preventDefault()
        },
      })
    },

    getItemTextProps(props) {
      const itemState = getItemState(props)
      return normalize.element({
        ...parts.itemText.attrs,
        "data-disabled": dataAttr(itemState.isDisabled),
        "data-selected": dataAttr(itemState.isSelected),
        "data-focused": dataAttr(itemState.isFocused),
      })
    },

    getItemIndicatorProps(props) {
      const itemState = getItemState(props)
      return normalize.element({
        ...parts.itemIndicator.attrs,
        "aria-hidden": true,
        "data-disabled": dataAttr(itemState.isDisabled),
        "data-selected": dataAttr(itemState.isSelected),
        "data-focused": dataAttr(itemState.isFocused),
        hidden: !itemState.isSelected,
      })
    },

    getBranchState,
    getBranchProps(props) {
      const branchState = getBranchState(props)
      return normalize.element({
        ...parts.branch.attrs,
        "data-depth": props.depth,
        dir: state.context.dir,
        "data-branch": branchState.value,
        role: "treeitem",
        "data-ownedby": dom.getTreeId(state.context),
        "aria-level": props.depth,
        "aria-selected": branchState.isDisabled ? undefined : branchState.isSelected,
        "data-selected": dataAttr(branchState.isSelected),
        "aria-expanded": branchState.isExpanded,
        "data-state": branchState.isExpanded ? "open" : "closed",
        "aria-disabled": branchState.isDisabled,
        "data-disabled": dataAttr(branchState.isDisabled),
        style: {
          "--depth": props.depth,
        },
      })
    },

    getBranchIndicatorProps(props) {
      const branchState = getBranchState(props)
      return normalize.element({
        ...parts.branchIndicator.attrs,
        "aria-hidden": true,
        "data-state": branchState.isExpanded ? "open" : "closed",
        "data-disabled": dataAttr(branchState.isDisabled),
        "data-selected": dataAttr(branchState.isSelected),
        "data-focused": dataAttr(branchState.isFocused),
      })
    },

    getBranchTriggerProps(props) {
      const branchState = getBranchState(props)
      return normalize.element({
        ...parts.branchTrigger.attrs,
        role: "button",
        dir: state.context.dir,
        "data-disabled": dataAttr(branchState.isDisabled),
        "data-state": branchState.isExpanded ? "open" : "closed",
        onClick(event) {
          if (branchState.isDisabled) return
          send({ type: "BRANCH_TOGGLE.CLICK", id: branchState.value })
          event.stopPropagation()
        },
      })
    },

    getBranchControlProps(props) {
      const branchState = getBranchState(props)
      return normalize.element({
        ...parts.branchControl.attrs,
        role: "button",
        dir: state.context.dir,
        tabIndex: branchState.isFocused ? 0 : -1,
        "data-state": branchState.isExpanded ? "open" : "closed",
        "data-disabled": dataAttr(branchState.isDisabled),
        "data-selected": dataAttr(branchState.isSelected),
        "data-branch": branchState.value,
        "data-depth": props.depth,
        onFocus(event) {
          send({ type: "ITEM.FOCUS", id: branchState.value })
          event.stopPropagation()
        },
        onClick(event) {
          if (branchState.isDisabled) return

          const isMetaKey = event.metaKey || event.ctrlKey
          send({ type: "BRANCH.CLICK", id: branchState.value, shiftKey: event.shiftKey, ctrlKey: isMetaKey })

          event.stopPropagation()
        },
      })
    },

    getBranchTextProps(props) {
      const branchState = getBranchState(props)
      return normalize.element({
        ...parts.branchText.attrs,
        dir: state.context.dir,
        "data-branch": branchState.value,
        "data-disabled": dataAttr(branchState.isDisabled),
        "data-state": branchState.isExpanded ? "open" : "closed",
      })
    },

    getBranchContentProps(props) {
      const branchState = getBranchState(props)
      return normalize.element({
        ...parts.branchContent.attrs,
        role: "group",
        dir: state.context.dir,
        "data-branch": branchState.value,
        "data-state": branchState.isExpanded ? "open" : "closed",
        hidden: !branchState.isExpanded,
      })
    },
  }
}
