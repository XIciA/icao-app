"""Regression checks for identity-preserving plans and changed-text audio."""
import importlib.util,json,pathlib,tempfile,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('prepare',pathlib.Path(__file__).with_name('prepare-question-order.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PreparationTests(unittest.TestCase):
 def test_changed_wording_with_explicit_old_path_regenerates_and_keeps_scopes(self):
  bank={'id':'opi','categories':[{'id':'c','name':'C','topics':[{'id':'t','name':'T','scopeCardIds':{'all':['q']},'cards':[{'id':'q','audioText':'Old?','audio':'/old.mp3'}]}]}]}
  order={'id':'offline','revision':1,'kind':'questions'}
  sources={'banks':[{'bankId':'opi','checksum':'a'*64,'payload':bank}]}
  history={'baseChecksum':'b'*64,'briefs':[{'id':'old','date':'2026-01-14','title':'Old','centers':['A','B'],'topics':[{'topicId':'t','topicTitle':'T','cardIds':['q']}]}]}
  plan={'operations':[{'bankId':'opi','categoryId':'c','topicId':'t','cardId':'q','action':'update','card':{'audioText':'New?','audio':'/old.mp3'}}],'hotspotUpdates':history}
  def run(args,**kwargs):
   if args[0]=='ffmpeg':pathlib.Path(args[-1]).write_bytes(b'test mp3 bytes')
  with tempfile.TemporaryDirectory() as out,patch.object(module.subprocess,'run',side_effect=run) as calls,patch.object(module.subprocess,'check_output',return_value='2.5'):
   module.prepare(order,sources,plan,pathlib.Path(out))
   draft=json.loads((pathlib.Path(out)/'draft.json').read_text())['draft'];topic=draft['banks'][0]['payload']['categories'][0]['topics'][0]
   self.assertEqual(topic['scopeCardIds'],{'all':['q']});self.assertEqual(topic['cards'][0]['id'],'q');self.assertNotEqual(topic['cards'][0]['audio'],'/old.mp3')
   self.assertEqual(draft['hotspotUpdates'],history);self.assertEqual(calls.call_count,2)
   self.assertEqual(bank['categories'][0]['topics'][0]['cards'][0]['audioText'],'Old?')
if __name__=='__main__':unittest.main()
