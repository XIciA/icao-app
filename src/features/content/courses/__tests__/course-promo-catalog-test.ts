import { coursePromoCatalog, type CourseCategory, type CoursePlan } from '../course-promo-catalog';

describe('course promotion catalog', () => {
  it('records the verified online snapshot metadata', () => {
    expect(coursePromoCatalog.source).toEqual({
      url: 'https://feizhuicao.com/promo',
      syncedAt: '2026-07-23',
      sha256: '823694bda130d2c067cbf2f65cbda2c54b7a8decb16331bc15a94ffa3b3b9246',
    });
  });

  it('contains all four categories and all nine uniquely identified plans', () => {
    expect(coursePromoCatalog.pricing.categories.map(({ id, label, plans }) => ({ id, label, count: plans.length }))).toEqual([
      { id: 'summer', label: '暑期小班', count: 2 },
      { id: 'icao4', label: 'ICAO 4 备考', count: 3 },
      { id: 'icao5', label: 'ICAO 5 进阶', count: 2 },
      { id: 'assessment', label: '专项深测', count: 2 },
    ]);

    const categories: readonly CourseCategory[] = coursePromoCatalog.pricing.categories;
    const plans: CoursePlan[] = categories.flatMap((category) => category.plans);
    expect(plans).toHaveLength(9);
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(9);
    expect(plans.map((plan) => plan.name)).toEqual([
      '暑期特价小班基础班',
      '暑期特价小班进阶班',
      'ICAO 4 基础班',
      'ICAO 4 包过班',
      'ICAO 4 冲刺班',
      'ICAO 5 基础班',
      'ICAO 5 冲刺班',
      'OPI 专项深测',
      '全板块深测',
    ]);
    expect(plans.map(({ name, price, unit, period }) => ({ name, price, unit, period }))).toEqual([
      { name: '暑期特价小班基础班', price: '3000', unit: '元 / 15 课时', period: '7月16日 / 8月1日开班' },
      { name: '暑期特价小班进阶班', price: '2000', unit: '元 / 10 课时', period: '7月16日 / 8月1日开班' },
      { name: 'ICAO 4 基础班', price: '3300', unit: '元 / 12 课时', period: '周期约 20 天' },
      { name: 'ICAO 4 包过班', price: '4999', unit: '元 / 15 课时', period: '周期约 30 天' },
      { name: 'ICAO 4 冲刺班', price: '2300', unit: '元 / 8 课时', period: '周期 10-12 天' },
      { name: 'ICAO 5 基础班', price: '5400', unit: '元 / 18 节课', period: '周期约 50 天' },
      { name: 'ICAO 5 冲刺班', price: '4500', unit: '元 / 12 节课', period: '周期约 30 天' },
      { name: 'OPI 专项深测', price: '400', unit: '元 / 2 课时', period: undefined },
      { name: '全板块深测', price: '400', unit: '元 / 2 课时', period: undefined },
    ]);

    plans.forEach((plan) => {
      expect(plan.price).toBeTruthy();
      expect(plan.unit).toBeTruthy();
      expect(plan.description).toBeTruthy();
      expect(plan.outline.length).toBeGreaterThan(0);
      plan.outline.forEach((section) => expect(section.items.length).toBeGreaterThan(0));
    });
  });

  it('preserves the guaranteed-course privileges and both consultation accounts', () => {
    const icao4 = coursePromoCatalog.pricing.categories.find((category) => category.id === 'icao4');
    const guaranteed = icao4?.plans.find((plan) => plan.id === 'icao4-guaranteed');

    expect(guaranteed?.privileges?.map((section) => section.title)).toEqual(['免费测试', '负责到底', '多对一授课', '教师团队配置']);
    expect(coursePromoCatalog.contact.wechatIds).toEqual(['15736231388', '17367473982']);
  });
});
