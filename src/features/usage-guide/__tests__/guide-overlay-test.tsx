import { GuideScrollView } from '../GuideScrollView';
import { fireEvent, render } from '@testing-library/react-native';
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
it('declines an impossible placement instead of inventing a fallback card', () => {
  const p = guidePlacement({x:15,y:30,width:250,height:190},290,280,150);
  expect(p.compact).toBe(true);
});
it('adds no host elements in existing screens when no tour provider is mounted', async () => {
  const anchor=await render(<GuideAnchor id="radio-bank" />);expect(anchor.toJSON()).toBeNull();
  const modal=await render(<GuideModalScope visible><AppText>原有弹层</AppText></GuideModalScope>);expect(modal.getByText('原有弹层')).toBeTruthy();expect(modal.queryByTestId('guide-overlay')).toBeNull();
});
it('has nine distinct entrances and a complete radio-to-study chain', () => {
  expect(new Set(GUIDE_ENTRIES.map(e=>e.id)).size).toBe(9);
  expect(GUIDE_FLOWS.radio?.map(s=>s.id)).toEqual(['radio-bank','radio-order','radio-speed','radio-interval','radio-subtitle','radio-play','radio-study']);
  for(const steps of Object.values(GUIDE_FLOWS))for(const step of steps)expect(step.text.length).toBeLessThan(46);
});

it('does not blindly place an unmeasured callout over the bottom action', () => {
  const p = guidePlacement(undefined, 390, 844, 150, {top:59,bottom:34});
  expect(p.compact).toBe(true);
});
it('leaves a gap around the real bottom action across phone sizes and safe areas', () => {
  for (const height of [568,740,844,932]) for (const bubbleHeight of [110,150,190]) {
    const target={x:20,y:height-110,width:350,height:50};
    const p=guidePlacement(target,390,height,bubbleHeight,{top:59,bottom:34});
    expect(p.compact).toBe(false);expect(p.y+bubbleHeight).toBeLessThanOrEqual(target.y-16);
    expect(p.y).toBeGreaterThanOrEqual(75);
  }
});

it('preserves original scrolling props and event callbacks outside a tour', async () => {
  const onScroll=jest.fn(); const style={padding:12};
  const screen=await render(<GuideScrollView testID="normal-scroll" onScroll={onScroll} scrollEventThrottle={7} contentContainerStyle={style}><AppText>原有内容</AppText></GuideScrollView>);
  const host=screen.getByTestId('normal-scroll');
  expect(host.props.scrollEventThrottle).toBe(7);
  const event={nativeEvent:{contentOffset:{x:0,y:80}}};await fireEvent.scroll(host,event);
  expect(onScroll).toHaveBeenCalledTimes(1);expect(onScroll).toHaveBeenCalledWith(expect.objectContaining({nativeEvent:expect.objectContaining({contentOffset:{x:0,y:80}})}));
  expect(screen.getByText('原有内容')).toBeTruthy();
});

it('keeps compact skip dimensions and moves left when a favorite action occupies the right corner', () => {
  const { guideSkipPlacement } = jest.requireActual('../guide-placement');
  for (const width of [278, 320, 390, 768]) {
    const favorite = {x:width-60,y:50,width:44,height:44};
    const pill = guideSkipPlacement(favorite,width,50);
    expect(pill.x).toBe(72); expect(pill.width).toBe(112); expect(pill.height).toBe(44);
    expect(pill.x+pill.width).toBeLessThan(favorite.x);
  }
});
it('keeps the documentation step IDs and user prompts in sync with runtime definitions', () => {
  const fs = jest.requireActual('fs') as {readFileSync:(path:string,encoding:string)=>string};
  const document = fs.readFileSync(`${process.cwd()}/docs/resources/project/usage-guide.md`,'utf8');
  const ids = [...document.matchAll(/^\| ([a-z]+-[a-z]+) \|/gm)].map(value=>value[1]);
  const steps = Object.values(GUIDE_FLOWS).flat();
  expect(ids.sort()).toEqual(steps.map(step=>step.id).sort());
  for (const step of steps) expect(document).toContain(step.text);
  expect(GUIDE_FLOWS.hotspot).toHaveLength(1); expect(GUIDE_FLOWS.resources).toHaveLength(1);
  expect(GUIDE_FLOWS.study?.at(-1)).toMatchObject({id:'study-recap',read:true});
});
it('keeps callout actions above the business footer even when their target is inside it', () => {
  for (const height of [568,740,844]) {
    const p=guidePlacement({x:16,y:height-60,width:44,height:44},390,height,150,{top:52,bottom:140});
    expect(p.compact).toBe(false);expect(p.y+150).toBeLessThanOrEqual(height-140-16);
  }
});
it('respects a callout exclusion area beneath a relocated skip button', () => {
 const p=guidePlacement({x:16,y:50,width:350,height:145},390,844,120,{top:260,bottom:160});
 expect(p.y).toBeGreaterThanOrEqual(276);
});
