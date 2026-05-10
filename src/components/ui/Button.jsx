const variantClassMap = {
  primary: 'btn btn--primary',
  secondary: 'btn btn--secondary',
  ghost: 'btn btn--ghost',
}

function Button({
  children,
  variant = 'primary',
  as = 'button',
  className = '',
  type = 'button',
  ...rest
}) {
  const Component = as
  const buttonClass = `${variantClassMap[variant] || variantClassMap.primary} ${className}`.trim()

  if (Component !== 'button') {
    return (
      <Component className={buttonClass} {...rest}>
        {children}
      </Component>
    )
  }

  return (
    <button type={type} className={buttonClass} {...rest}>
      {children}
    </button>
  )
}

export default Button
