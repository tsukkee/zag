import { env, nextTick } from "@core-foundation/utils"
import { createMachine, guards, preserve } from "@ui-machines/core"
import scrollIntoView from "scroll-into-view-if-needed"
import { LiveRegion } from "../utils/live-region"
import { observeNodeAttr } from "../utils/mutation-observer"
import { trackPointerDown } from "../utils/pointer-down"
import { WithDOM } from "../utils/types"
import { dom, getElements } from "./combobox.dom"

const { and } = guards

type Option = {
  label: string
  value: string
}

export type ComboboxMachineContext = WithDOM<{
  /**
   * The name applied to the `input` element. Useful for form submissions.
   */
  name?: string
  /**
   * Whether the combobox is disabled
   */
  disabled?: boolean
  /**
   * Whether to allow custom value in the input.
   *
   * This prevents the input from being cleared when blurred
   * and call `onSelect` with the input's value
   */
  allowCustomValue?: boolean
  /**
   * Whether to close the menu when the input is blurred
   */
  closeOnBlur?: boolean
  /**
   * Whether to focus the input when it is mounted
   */
  autoFocus?: boolean
  /**
   * Whether to close the popup when an option is selected
   * with keyboard or pointer
   */
  closeOnSelect?: boolean | ((value: Option) => boolean)
  /**
   * Whether the popup should open on focus
   */
  openOnClick?: boolean
  /**
   * Whether the input's value should be selected
   * on focus. This is useful if the user is likely
   * to delete the entire value in the input (e.g browser search bar)
   */
  selectInputOnFocus?: boolean
  /**
   * Whether the combobox is in read-only mode
   */
  readonly?: boolean
  /**
   * Whether the combobox is required
   */
  required?: boolean
  /**
   * The initial value that shows up in the input
   */
  inputValue: string
  /**
   * The selected value for the combobox
   */
  selectedValue: string
  /**
   * The value of the option when navigating with the keyboard/pointer
   */
  navigationValue: string
  /**
   *  The input placeholder
   */
  placeholder?: string
  /**
   * Whether to select the first option on input change
   */
  autoSelect?: boolean
  /**
   * Whether the value in the input changes as the user navigates
   * with the keyboard.
   */
  autoComplete?: boolean
  /**
   * Function called when the input value changes
   */
  onInputValueChange?: (value: string) => string
  /**
   * Function called when an option is selected by pointer or keyboard
   */
  onSelect?: (value: string) => void
  /**
   * The `id` of the highlighted option
   */
  activeId: string | null
  /**
   * The event source for triggers highlighted option change
   */
  eventSource: "pointer" | "keyboard" | null
  /**
   * The live region for the combobox
   */
  liveRegion?: LiveRegion | null
}>

export type ComboboxMachineState = {
  value: "unknown" | "focused" | "open" | "closed"
}

export const comboboxMachine = createMachine<ComboboxMachineContext, ComboboxMachineState>(
  {
    id: "combobox-machine",
    initial: "unknown",
    context: {
      uid: "combobox",
      autoSelect: true,
      autoComplete: true,
      closeOnSelect: true,
      closeOnBlur: true,
      openOnClick: false,
      activeId: null,
      inputValue: "",
      selectedValue: "",
      navigationValue: "",
      eventSource: null,
      liveRegion: null,
      pointerdownNode: null,
    },
    on: {
      SET_COUNT: {
        actions: "setCount",
      },
    },
    states: {
      unknown: {
        on: {
          SETUP: {
            target: "closed",
            actions: ["setId", "setOwnerDocument", "setLiveRegion"],
          },
        },
      },
      open: {
        entry: ["announceOptionCount"],
        activities: ["scrollOptionIntoView", "trackPointerDown"],
        on: {
          ARROW_DOWN: [
            {
              cond: and("autoComplete", "isLastOptionFocused"),
              actions: ["clearFocusedOption", "setEventSourceToKeyboard"],
            },
            {
              actions: ["selectNextOptionId", "setEventSourceToKeyboard"],
            },
          ],
          ARROW_UP: [
            {
              cond: and("autoComplete", "isFirstOptionFocused"),
              actions: ["clearFocusedOption", "setEventSourceToKeyboard"],
            },
            {
              actions: ["selectPrevOptionId", "setEventSourceToKeyboard"],
            },
          ],
          ESCAPE: "closed",
          ENTER: [
            {
              cond: "closeOnSelect",
              target: "closed",
              actions: ["setSelectedValue", "announceSelectedOption", "clearFocusedOption"],
            },
            {
              actions: ["setSelectedValue", "announceSelectedOption"],
            },
          ],
          TYPE: [
            {
              target: "open",
              cond: "autoSelect",
              actions: ["setInputValue", "focusFirstOption", "announceOptionCount", "setEventSourceToKeyboard"],
            },
            {
              target: "open",
              actions: ["setInputValue", "announceOptionCount", "setEventSourceToKeyboard"],
            },
          ],
          OPTION_POINTEROVER: {
            actions: ["setActiveOption", "setEventSourceToPointer"],
          },
          OPTION_POINTEROUT: {
            actions: ["clearFocusedOption"],
          },
          OPTION_CLICK: [
            {
              cond: "closeOnSelect",
              target: "closed",
              actions: ["setSelectedValue", "announceSelectedOption", "focusInput"],
            },
            {
              actions: ["setSelectedValue", "announceSelectedOption", "focusInput"],
            },
          ],
          INPUT_BLUR: [
            {
              cond: and("allowCustomValue", "closeOnBlur"),
              target: "closed",
            },
            {
              cond: "closeOnBlur",
              target: "closed",
            },
          ],
          BUTTON_CLICK: { target: "closed", actions: "focusInput" },
        },
      },
      focused: {
        on: {
          INPUT_BLUR: "closed",
          INPUT_CLICK: {
            cond: "openOnClick",
            target: "open",
          },
          ARROW_DOWN: {
            target: "open",
            actions: ["focusFirstOption", "setEventSourceToKeyboard"],
          },
          ARROW_UP: {
            target: "open",
            actions: ["selectLastOptionId", "setEventSourceToKeyboard"],
          },
          TYPE: [
            {
              target: "open",
              cond: "autoSelect",
              actions: ["setInputValue", "focusFirstOption", "announceOptionCount", "setEventSourceToKeyboard"],
            },
            {
              target: "open",
              actions: ["setInputValue", "announceOptionCount", "setEventSourceToKeyboard"],
            },
          ],
          BUTTON_CLICK: {
            target: "open",
            actions: "focusInput",
          },
          ESCAPE: {
            actions: "clearInputValue",
          },
        },
      },
      closed: {
        after: {
          0: { cond: "isInputFocused", target: "focused" },
        },
        entry: ["clearFocusedOption", "clearEventSource"],
        on: {
          INPUT_FOCUS: "focused",
          BUTTON_CLICK: {
            target: "open",
            actions: "focusInput",
          },
        },
      },
    },
  },
  {
    guards: {
      openOnClick: (ctx) => !!ctx.openOnClick,
      closeOnBlur: (ctx) => !!ctx.closeOnBlur,
      closeOnSelect: (ctx) => !!ctx.closeOnSelect,
      isInputFocused: (ctx) => dom(ctx).isFocused,
      autoComplete: (ctx) => !!ctx.autoComplete,
      autoSelect: (ctx) => !!ctx.autoSelect,
      isFirstOptionFocused: (ctx) => dom(ctx).first.id === ctx.activeId,
      isLastOptionFocused: (ctx) => dom(ctx).last.id === ctx.activeId,
    },
    activities: {
      trackPointerDown,
      scrollOptionIntoView(ctx) {
        const { input, listbox } = getElements(ctx)
        return observeNodeAttr(input, "aria-activedescendant", () => {
          const { activeOption: opt } = getElements(ctx)
          if (!opt || ctx.eventSource !== "keyboard") return
          scrollIntoView(opt, {
            boundary: listbox,
            block: "nearest",
            scrollMode: "if-needed",
          })
        })
      },
    },
    actions: {
      setId(ctx, evt) {
        ctx.uid = evt.id
      },
      setOwnerDocument(ctx, evt) {
        ctx.doc = preserve(evt.doc)
      },
      setLiveRegion(ctx) {
        const region = new LiveRegion({ ariaLive: "assertive", doc: ctx.doc })
        ctx.liveRegion = preserve(region)
      },
      setActiveOption(ctx, evt) {
        ctx.activeId = evt.id
        ctx.navigationValue = evt.value
      },
      clearFocusedOption(ctx) {
        ctx.activeId = null
        ctx.navigationValue = ""
      },
      setSelectedValue(ctx, evt) {
        ctx.selectedValue = ctx.navigationValue || evt.value
        ctx.inputValue = ctx.selectedValue
      },
      focusInput(ctx) {
        nextTick(() => {
          const { input } = getElements(ctx)
          input?.focus()
        })
      },
      setInputValue(ctx, evt) {
        ctx.inputValue = evt.value
      },
      invokeOnInputChange(ctx) {
        ctx.onInputValueChange?.(ctx.inputValue)
      },
      invokeOnSelect(ctx) {
        ctx.onSelect?.(ctx.selectedValue)
      },
      focusFirstOption(ctx) {
        nextTick(() => {
          const { first } = dom(ctx)
          if (!first) return
          ctx.activeId = first.id
          ctx.navigationValue = first.getAttribute("data-label") ?? ""
        })
      },
      selectLastOptionId(ctx) {
        nextTick(() => {
          const { last } = dom(ctx)
          if (!last) return
          ctx.activeId = last.id
          ctx.navigationValue = last.getAttribute("data-label") ?? ""
        })
      },
      selectNextOptionId(ctx) {
        const { next } = dom(ctx)

        let nextOption = next(ctx.activeId ?? "")
        if (!nextOption) return

        ctx.activeId = nextOption.id
        ctx.navigationValue = nextOption.getAttribute("data-label") ?? ""
      },
      selectPrevOptionId(ctx) {
        const options = dom(ctx)
        const prevOption = options.prev(ctx.activeId ?? "")
        if (!prevOption) return
        ctx.activeId = prevOption.id
        ctx.navigationValue = prevOption.getAttribute("data-label") ?? ""
      },
      setEventSourceToKeyboard(ctx) {
        ctx.eventSource = "keyboard"
      },
      setEventSourceToPointer(ctx) {
        ctx.eventSource = "pointer"
      },
      clearEventSource(ctx) {
        ctx.eventSource = null
      },
      // Announce the number of available suggestions when it changes
      announceOptionCount(ctx) {
        // First, check the `aria-setsize` of any option (if virtualized)
        // Next, query the dom for the number of options in the list
        // Announcing the number of options
        nextTick(() => {
          // const count = ctx.childNodes?.value.length
          // const msg = formatMessage(count)
          ctx.liveRegion?.announce("you typed")
        })
      },
      announceSelectedOption(ctx) {
        if (!env.apple()) return
        const msg = `${ctx.selectedValue}, selected`
        ctx.liveRegion?.announce(msg)
      },
    },
  },
)
