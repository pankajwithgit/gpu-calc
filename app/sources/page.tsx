'use client';

import { PageSection } from '@patternfly/react-core';
import Sources from './Sources';

export default function SourcesPage() {
  return (
    <PageSection
      padding={{ default: 'noPadding' }}
      style={{ backgroundColor: 'var(--gc-bg-2, #f5f5f5)', minHeight: '100vh' }}
    >
      <Sources />
    </PageSection>
  );
}
