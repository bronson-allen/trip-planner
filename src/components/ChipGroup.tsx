type ChipGroupBase = {
  options: readonly string[]
  even?: boolean
  'aria-label'?: string
}

type ChipGroupProps =
  | (ChipGroupBase & {
      multiple?: false
      value: string
      onChange: (next: string) => void
    })
  | (ChipGroupBase & {
      multiple: true
      value: string[]
      onChange: (next: string[]) => void
    })

export default function ChipGroup(props: ChipGroupProps) {
  const { options, even, 'aria-label': ariaLabel } = props

  function isSelected(option: string) {
    return props.multiple ? props.value.includes(option) : props.value === option
  }

  function toggle(option: string) {
    if (props.multiple) {
      props.onChange(
        props.value.includes(option)
          ? props.value.filter((item) => item !== option)
          : [...props.value, option],
      )
      return
    }

    props.onChange(option)
  }

  return (
    <div
      className={`chip-group${even ? ' chip-group--even' : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`chip${isSelected(option) ? ' chip--selected' : ''}`}
          aria-pressed={isSelected(option)}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
