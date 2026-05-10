import { featureItems } from '../../data/landingContent'
import SectionHeading from '../ui/SectionHeading'
import FeatureCard from '../ui/FeatureCard'

function FeaturesSection({ sectionRef }) {
  return (
    <section ref={sectionRef} className="content-section" id="features">
      <SectionHeading
        id="features-title"
        eyebrow="Everything in one app"
        title="Three ways to find what you need."
      />

      <div className="features-grid">
        {featureItems.map((item) => (
          <FeatureCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

export default FeaturesSection
