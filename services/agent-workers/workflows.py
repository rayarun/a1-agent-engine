import logging
import json
from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

@workflow.defn
class AgentWorkflow:
    @workflow.run
    async def run(self, request: dict) -> str:
        agent_id = request.get('agent_id')
        prompt = request.get('payload', {}).get('prompt', "Hello")
        
        # 1. Recall Relevant Memories
        # Activity referenced by string to maintain determinism
        past_memories = await workflow.execute_activity(
            "recall_memories",
            args=[prompt, agent_id],
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(maximum_attempts=2)
        )
        
        system_content = "You are a helpful assistant with code execution capabilities."
        if past_memories:
            system_content += "\n\nPast findings/memories:\n- " + "\n- ".join(past_memories)

        messages = [{"role": "system", "content": system_content}]
        messages.append({"role": "user", "content": prompt})

        # 2. Reasoning Loop
        max_iterations = 5
        final_answer = None

        for i in range(max_iterations):
            workflow.logger.info(f"Reasoning iteration {i+1}...")
            
            # Execute LLM call as an activity to maintain determinism
            step_result = await workflow.execute_activity(
                "reasoning_step",
                args=[messages, request.get('model', "mock-gpt-4o")],
                start_to_close_timeout=timedelta(seconds=60)
            )
            
            content = step_result.get("content")
            tool_calls = step_result.get("tool_calls")
            
            workflow.logger.info(f"LLM Response: {content or 'Tool calls initiated'}")
            
            if tool_calls:
                assistant_msg = {"role": "assistant", "content": content, "tool_calls": []}
                for tc in tool_calls:
                     assistant_msg["tool_calls"].append({
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["function"]["name"], "arguments": tc["function"]["arguments"]}
                     })
                
                messages.append(assistant_msg)
                
                for tc in tool_calls:
                    if tc["function"]["name"] == "execute_code":
                        args = json.loads(tc["function"]["arguments"])
                        result = await workflow.execute_activity(
                            "execute_code",
                            args['code'],
                            start_to_close_timeout=timedelta(seconds=60),
                            retry_policy=RetryPolicy(maximum_attempts=3)
                        )
                        messages.append({
                            "tool_call_id": tc["id"],
                            "role": "tool",
                            "name": "execute_code",
                            "content": result,
                        })
                continue
            
            final_answer = content
            break

        if not final_answer:
            final_answer = "Exceeded max reasoning iterations without a conclusion."

        # 3. Store what was learned
        await workflow.execute_activity(
            "store_memory",
            args=[f"Observation for '{prompt}': {final_answer}", agent_id],
            start_to_close_timeout=timedelta(seconds=10)
        )

        return f"Agent {agent_id} completed task: {final_answer}"
