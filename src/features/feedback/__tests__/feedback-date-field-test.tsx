import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FeedbackDateField } from '../FeedbackDateField';

function Field() {
  const [value,setValue]=useState('2024-02-28');
  return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,left:0,right:0,bottom:0}}}><FeedbackDateField value={value} onChange={setValue}/></SafeAreaProvider>;
}
it('offers valid leap-month days, keeps selection on cancellation and saves only the chosen calendar date',async()=>{
  const view=await render(<Field/>);
  await fireEvent.press(view.getByLabelText('考试时间'));
  expect(view.getByLabelText('2024-02-29')).toBeTruthy();expect(view.queryByLabelText('2024-02-30')).toBeNull();
  await fireEvent.press(view.getByLabelText('2024-02-29'));await fireEvent.press(view.getByText('取消'));
  expect(view.getByText('2024-02-28')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('考试时间'));await fireEvent.press(view.getByLabelText('上个月'));
  expect(view.getByLabelText('2024-01-31')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('下个月'));await fireEvent.press(view.getByLabelText('2024-02-29'));await fireEvent.press(view.getByText('确定'));
  expect(view.getByText('2024-02-29')).toBeTruthy();
});
