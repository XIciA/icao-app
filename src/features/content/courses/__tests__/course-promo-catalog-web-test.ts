import { webCoursePromoCatalog, type WebCoursePlan } from '../course-promo-catalog.web-data';

describe('webCoursePromoCatalog', () => {
  it('mirrors the current live /promo course matrix', () => {
    const views = Object.values(webCoursePromoCatalog.pricing.views) as { plans: readonly WebCoursePlan[] }[];
    const plans = views.flatMap((view) => view.plans);

    expect(webCoursePromoCatalog.source).toEqual({
      url: 'https://feizhuicao.com/promo',
      syncedAt: '2026-09-17',
      liveHtmlSha256: '749fffe70a4d270c9ae47f7a8ab542af5c715bf1956315a6b768ed9857365c99',
    });
    expect(views).toHaveLength(5);
    expect(plans).toHaveLength(12);
    expect(plans.map((plan) => `${plan.name}:${plan.price}:${plan.unit}`)).toEqual(expect.arrayContaining([
      'ICAO 4 初考基础班:4500:元 / 15 节课 + 2 次模拟测试',
      'ICAO 4 初考包过班:6999:元 / 无限课时',
      'ICAO 4 复考包过班:5999:元 / 无限课时',
      'ICAO 4 预习课程:3000:元 / 12 节课',
      'ICAO 5 包过班:8999:元 / 无限课时',
    ]));
    expect(webCoursePromoCatalog.advantages.items[0].description).toContain('95%+');
    expect(webCoursePromoCatalog.advantages.items[0].description).toContain('92%+');
    expect(webCoursePromoCatalog.advantages.items[0].description).toContain('90%+');
    expect(webCoursePromoCatalog.story.paragraphs.join('')).toContain('超过 100 名学员');
    expect(webCoursePromoCatalog.contact.wechatIds).toEqual(['15736231388', '17367473982']);
  });

  it('keeps the complete guaranteed-course service promise', () => {
    const initialGuaranteed = webCoursePromoCatalog.pricing.views['icao4-initial'].plans[1];
    const icao5Guaranteed = webCoursePromoCatalog.pricing.views.icao5.plans[1];

    expect(initialGuaranteed.privileges?.map((section) => section.title)).toEqual([
      '免费测试',
      '负责到底',
      '多对一授课',
      '教师团队配置',
    ]);
    expect(icao5Guaranteed.privileges).toEqual(initialGuaranteed.privileges);
  });
});
