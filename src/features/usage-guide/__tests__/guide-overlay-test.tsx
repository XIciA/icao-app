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
it('offers a collapsible edge hint for reading regions that fill the viewport', () => {
  const p = guidePlacement({x:15,y:30,width:250,height:190},290,280,150);
  expect(p.compact).toBe(true);expect(p.y).toBeGreaterThanOrEqual(16);expect(p.y+150).toBeLessThanOrEqual(280);
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

it('does not blindly place an unmeasured callout over the bottom action', () => {
  const p = guidePlacement(undefined, 390, 844, 150, {top:59,bottom:34});
  expect(p.y).toBe(131); expect(p.compact).toBe(true);
});
it('leaves a gap around the real bottom action across phone sizes and safe areas', () => {
  for (const height of [568,740,844,932]) for (const bubbleHeight of [110,150,190]) {
    const target={x:20,y:height-110,width:350,height:50};
    const p=guidePlacement(target,390,height,bubbleHeight,{top:59,bottom:34});
    expect(p.compact).toBe(false);expect(p.y+bubbleHeight).toBeLessThanOrEqual(target.y-16);
    expect(p.y).toBeGreaterThanOrEqual(75);
  }
});
