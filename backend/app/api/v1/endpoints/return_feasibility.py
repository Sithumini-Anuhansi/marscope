from fastapi import APIRouter, HTTPException
from app.schemas.return_feasibility import ReturnAssessmentRequest
from app.services.return_feasibility import assess_scenario
from app.api.v1.endpoints.survival import _refresh_db,_summary
from app.api.v1.endpoints.crew import MISSION_ID
from app.api.v1.endpoints.crew import _roster

router=APIRouter(prefix='/missions/{mission_id}/return-assessments',tags=['return feasibility'])

@router.post('')
async def assess_return(mission_id:str,request:ReturnAssessmentRequest):
    if mission_id!=MISSION_ID: raise HTTPException(404,'Mission not found')
    await _refresh_db()
    summary=_summary()
    resources=summary['resources']
    scenarios=[assess_scenario(scenario,resources,summary['equipment'],[member.id for member in _roster]) for scenario in request.scenarios]
    precedence=['feasible-under-stated-assumptions','feasible-with-constraints','insufficient-information','high-risk','not-feasible-with-available-resources']
    overall=max((item['status'] for item in scenarios),key=lambda status:precedence.index(status))
    return {'mission_id':mission_id,'assessment_scope':'mission decision support; no trajectory simulation',
            'overall_status':overall,'scenario_comparison':len(scenarios)>1,
            'scenarios':scenarios,'resource_telemetry_status':'available' if resources else 'missing',
            'note':'Results follow only supplied constraints and measured resource telemetry. They are not certified mission-safety or trajectory results.'}
