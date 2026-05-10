function SectionHeading({ eyebrow, title, description, id }) {
  return (
    <header className="section-heading" aria-labelledby={id}>
      <p className="section-heading__eyebrow">{eyebrow}</p>
      <h2 id={id} className="section-heading__title">
        {title}
      </h2>
      {description ? <p className="section-heading__description">{description}</p> : null}
    </header>
  )
}

export default SectionHeading
