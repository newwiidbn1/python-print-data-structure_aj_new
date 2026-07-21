let pyodide=null;
async function init(){
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");
  pyodide=await loadPyodide();
  postMessage({type:"ready"});
}
init().catch(e=>postMessage({type:"init_error",error:String(e)}));

onmessage=async(e)=>{
  if(!pyodide)return;
  const {requestId,code,tests}=e.data;
  const sourceLiteral = JSON.stringify(code);
  const testsLiteral = JSON.stringify(JSON.stringify(tests));
  const wrapper=`
import json, io, contextlib, traceback, ast
source=${sourceLiteral}
test_specs=json.loads(${testsLiteral})
all_results=[]
for spec in test_specs:
    output=io.StringIO()
    inputs=iter(spec.get("stdin", []))
    def mock_input(prompt=""):
        try:
            return next(inputs)
        except StopIteration:
            raise EOFError("ไม่มี input เหลือสำหรับ test case นี้")
    env={"__name__":"__main__","input":mock_input}
    test_result={"name":spec["name"],"passed":False,"checks":[],"stdout":"","error":""}
    try:
        tree=ast.parse(source)
        with contextlib.redirect_stdout(output):
            exec(compile(tree, "<student-code>", "exec"), env, env)
        out_lines=[line.rstrip() for line in output.getvalue().splitlines() if line.strip()!=""]
        env["_out_lines"]=out_lines
        env["_source"]=source
        env["_ast"]=ast
        env["_tree"]=tree
        for c in spec.get("checks", []):
            try:
                passed=bool(eval(c["expr"], env, env))
                test_result["checks"].append({"label":c["label"],"passed":passed})
            except Exception as ce:
                test_result["checks"].append({"label":c["label"],"passed":False,"detail":str(ce)})
        test_result["passed"]=all(c["passed"] for c in test_result["checks"])
    except Exception as ex:
        test_result["error"]="".join(traceback.format_exception(type(ex),ex,ex.__traceback__))
    test_result["stdout"]=output.getvalue()
    all_results.append(test_result)
json.dumps({"ok":True,"tests":all_results},ensure_ascii=False)
`;
  try{
    const result=await pyodide.runPythonAsync(wrapper);
    postMessage({type:"result",requestId,data:JSON.parse(result)});
  }catch(err){
    postMessage({type:"result",requestId,data:{ok:false,error:String(err),tests:[]}});
  }
};