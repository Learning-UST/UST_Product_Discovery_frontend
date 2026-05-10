import { howItWorksSteps } from '../../data/landingContent'
import SectionHeading from '../ui/SectionHeading'
import './styles/HowItWorksSection.css'

function HowItWorksSection({ sectionRef }) {
  return (
    <section ref={sectionRef} className="content-section" id="how-it-works">
      <SectionHeading
        id="how-it-works-title"
        eyebrow="How it works"
        title="From shelf to cart in seconds."
      />

      <div className="steps-grid">
        {howItWorksSteps.map((step) => (
          <div key={step.id} className="step-card">
            <span className="step-card__number" aria-hidden="true">
              {step.number}
            </span>
            <h3 className="step-card__title">{step.title}</h3>
            <p className="step-card__description">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default HowItWorksSection
