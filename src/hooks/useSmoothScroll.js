import { useCallback } from 'react'

export function useSmoothScroll() {
  const scrollToSection = useCallback((sectionRef) => {
    if (!sectionRef?.current) {
      return
    }

    sectionRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [])

  return { scrollToSection }
}
