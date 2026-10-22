import { StackActions, StackRouter } from '@react-navigation/native';
import { accountRouteIdentity, infoRouteIdentity } from '../route-identity.native';

function stack(name: string, identity: typeof infoRouteIdentity, initial: Record<string, unknown>) {
  const router = StackRouter({ initialRouteName: name });
  const options = { routeNames: [name], routeParamList: { [name]: initial }, routeGetIdList: { [name]: ({ params }: { params?: object }) => identity(name, (params ?? {}) as Record<string, unknown>) } };
  let state = router.getInitialState(options);
  return {
    act(action: ReturnType<typeof StackActions.push>) { state = router.getStateForAction(state, action, options)!; return state; },
  };
}

it('pops feedback compose to the original history instead of relabeling the current dynamic screen', () => {
  const route = 'info/[slug]';
  const history = stack(route, infoRouteIdentity, { slug: 'feedback' });
  const composing = history.act(StackActions.push(route, { slug: 'feedback', compose: '1', source: 'profile' }));
  expect(composing.routes).toHaveLength(2);
  expect(history.act(StackActions.push(route, { slug: 'feedback', compose: '1', source: 'profile' })).routes).toHaveLength(2);
  const originalKey = composing.routes[0].key;
  const returned = history.act(StackActions.popTo(route, { slug: 'feedback' }));
  expect(returned.routes).toHaveLength(1);
  expect(returned.routes[0].key).toBe(originalKey);
  expect(returned.routes[0].params).toEqual({ slug: 'feedback' });
});

it('keeps a feedback detail separate, then returns through history without duplicate pages', () => {
  const route = 'info/[slug]';
  const history = stack(route, infoRouteIdentity, { slug: 'feedback' });
  expect(history.act(StackActions.push(route, { slug: 'feedback', ticket: 'FB-1' })).routes).toHaveLength(2);
  expect(history.act(StackActions.pop()).routes).toHaveLength(1);
  expect(history.act(StackActions.push(route, { slug: 'feedback', ticket: 'FB-2' })).routes).toHaveLength(2);
  expect(history.act(StackActions.pop()).routes[0].params).toEqual({ slug: 'feedback' });
});

it('pops phone and password flows to the existing security screen, then back to settings', () => {
  const route = 'account/[slug]';
  const account = stack(route, accountRouteIdentity, { slug: 'settings' });
  account.act(StackActions.push(route, { slug: 'security' }));
  account.act(StackActions.push(route, { slug: 'bind-phone' }));
  const security = account.act(StackActions.popTo(route, { slug: 'security' }));
  expect(security.routes.map(item => item.params)).toEqual([{ slug: 'settings' }, { slug: 'security' }]);
  account.act(StackActions.push(route, { slug: 'password', mode: 'setup' }));
  expect(account.act(StackActions.popTo(route, { slug: 'security' })).routes).toHaveLength(2);
  expect(account.act(StackActions.pop()).routes[0].params).toEqual({ slug: 'settings' });
});

it('returns a tutorial to its existing guide instead of another copy of the guide', () => {
  const route = 'info/[slug]';
  const guide = stack(route, infoRouteIdentity, { slug: 'guide' });
  guide.act(StackActions.push(route, { slug: 'tutorial', restart: '1' }));
  expect(guide.act(StackActions.popTo(route, { slug: 'guide' })).routes).toHaveLength(1);
});
