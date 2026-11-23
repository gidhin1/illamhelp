'use client';

import Link from 'next/link';
import { NavigationButton } from '@illamhelp/ui-web';
import { forwardRef, type ComponentProps } from 'react';

export const LinkButton = forwardRef<HTMLAnchorElement, Omit<ComponentProps<typeof NavigationButton>, 'component' | 'href'> & { href: string }>(function LinkButton(props, ref) {
  return <NavigationButton {...props} ref={ref} component={Link} />;
});
