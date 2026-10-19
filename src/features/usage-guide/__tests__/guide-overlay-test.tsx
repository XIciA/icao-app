import { render } from '@testing-library/react-native';
import { guidePlacement } from '../guide-placement';
import { GuideAnchor, GuideModalScope } from '../GuideBindings';
import { GUIDE_ENTRIES, GUIDE_FLOWS } from '../guide-flows';
import { AppText } from '@/components/ui';
it('keeps a measured bubble inside narrow viewports, above targets near the bottom', () => {
  for (const width of [278,320,390,768]) {
    const p = guidePlacement({x:width-50,y:650,width:40,height:44},width,740,125);
    expect(p.x).toBeGreaterThanOrEqual(16); expect(p.x+p.width).toBeLessThanOrEqual(width-16); expect(p.y).toBeGreaterThanOrEqual(16); expect(p.above).toBe(true);
  }
});
it('uses a line fallback if neither adjacent side fits and remains in bounds', () => {
  const p = guidePlacement({x:15,y:30,width:250,height:190},290,280,150);
  expect(p.line).toBe(true);expect(p.y).toBeGreaterThanOrEqual(16);expect(p.y+150).toBeLessThanOrEqual(280);
});
it('adds no host elements in existing screens when no tour provider is mounted', async () => {
  const anchor=await render(<GuideAnchor id="radio-bank" />);expect(anchor.toJSON()).toBeNull();
  const modal=await render(<GuideModalScope visible><AppText>原有弹层</AppText></GuideModalScope>);expect(modal.getByText('原有弹层')).toBeTruthy();expect(modal.queryByTestId('guide-overlay')).toBeNull();
});
it('has eight distinct entrances and a complete radio-to-study chain', () => {
  expect(new Set(GUIDE_ENTRIES.map(e=>e.id)).size).toBe(8);
  expect(GUIDE_FLOWS.radio?.map(s=>s.id)).toEqual(['radio-bank','radio-order','radio-speed','radio-interval','radio-subtitle','radio-play','radio-study']);
  for(const steps of Object.values(GUIDE_FLOWS))for(const step of steps)expect(step.text.length).toBeLessThan(46);
});
