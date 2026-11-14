def assess_scenario(scenario,resources,equipment=None,astronaut_ids=None):
    equipment=equipment or []
    equipment_ready=scenario.equipment_ready
    equipment_degraded=False
    if equipment_ready is None and equipment:
        states={item['status'] for item in equipment}
        equipment_degraded='degraded' in states
        equipment_ready=False if 'failed' in states else (None if 'unknown' in states else True)
    factors=[]; missing=[]; hard_failures=[]; constraints=[]
    if scenario.return_duration_days is None: missing.append('planned return duration')
    if scenario.crew_available is None: missing.append('crew availability')
    if scenario.route_status=='unknown': missing.append('assessed return route')
    if scenario.environmental_risk=='unknown': missing.append('environmental risk review')
    if equipment_ready is None: missing.append('equipment readiness')
    if scenario.return_vehicle_ready is None: missing.append('return vehicle readiness input')
    present={row['resource'] for row in resources}
    for required in ('oxygen','water','food','power'):
        if required not in present: missing.append(f'mission {required} telemetry')
    for astronaut_id in astronaut_ids or []:
        for required in ('oxygen','water','food'):
            if not any(row['resource']==required and row.get('astronaut_id')==astronaut_id for row in resources):
                missing.append(f"{astronaut_id} {required} allocation")
    if scenario.return_duration_days is not None:
        for resource in resources:
            endurance=resource.get('days_remaining')
            if endurance is None:
                missing.append(f"measured endurance for {resource['resource']} ({resource.get('astronaut_id') or 'mission-wide'})")
            elif endurance < scenario.return_duration_days:
                hard_failures.append(f"{resource.get('astronaut_id') or 'Mission'} {resource['resource']} endurance ({endurance:.1f} days) is below the planned {scenario.return_duration_days:.1f} days")
            else:
                factors.append(f"{resource.get('astronaut_id') or 'Mission'} {resource['resource']} projects {endurance:.1f} usable days from measured consumption")
    else:
        missing.append('resource comparison duration')
    if scenario.available_time_days is not None and scenario.return_duration_days is not None and scenario.return_duration_days > scenario.available_time_days:
        hard_failures.append('Planned return duration exceeds the supplied mission time constraint')
    if scenario.crew_available is False: hard_failures.append('Crew availability is marked insufficient')
    if scenario.route_status=='infeasible': hard_failures.append('Return route is marked infeasible')
    if equipment_ready is False: hard_failures.append('Required equipment is marked not ready')
    if scenario.return_vehicle_ready is False: hard_failures.append('Return vehicle readiness is marked false')
    if scenario.route_status=='constrained': constraints.append('Route has stated constraints')
    if equipment_degraded: constraints.append('One or more equipment items are degraded')
    if scenario.environmental_risk in {'moderate','high'}: constraints.append(f"Environmental risk is {scenario.environmental_risk}")
    if scenario.environmental_risk=='high': factors.append('High environmental risk requires mitigation and review')
    if hard_failures: status='not-feasible-with-available-resources'
    elif scenario.environmental_risk=='high' or scenario.route_status=='constrained' or equipment_degraded: status='high-risk'
    elif missing: status='insufficient-information'
    elif constraints: status='feasible-with-constraints'
    else: status='feasible-under-stated-assumptions'
    factors.extend(hard_failures)
    return {'scenario_id':scenario.scenario_id,'name':scenario.name,'status':status,'factors':factors,
      'constraints':constraints,'missing_information':sorted(set(missing)),
      'limitations':['Decision support only; no ascent, orbital, propulsion, rendezvous, or Earth-return trajectory model is implemented.','Resource projection assumes measured average consumption continues and does not model resupply, contingency use, or uncertainty bounds.']}
