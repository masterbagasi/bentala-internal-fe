
import { forwardRef } from 'react'
import { SLIDE_VARIANTS } from './variants'
import type { CarouselSlideData, CarouselSharedProps } from './types'

interface Props extends CarouselSharedProps {
  data: CarouselSlideData
  variantIndex?: number
}

export const CarouselSlide = forwardRef<HTMLDivElement, Props>(
  function CarouselSlide({ data, variantIndex = 0, ...shared }, ref) {
    const variants = SLIDE_VARIANTS[data.type]
    const safeIdx = ((variantIndex % variants.length) + variants.length) % variants.length
    const entry = variants[safeIdx] ?? variants[0]
    const Component = entry.component as React.ForwardRefExoticComponent<
      { data: CarouselSlideData } & CarouselSharedProps & React.RefAttributes<HTMLDivElement>
    >
    return <Component ref={ref} data={data} {...shared} />
  },
)
