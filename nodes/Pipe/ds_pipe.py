# ds_pipe.py
import re

class AnyType(str):
    """A special type that compares equal to any other type."""
    def __ne__(self, __value: object) -> bool:
        return False

# The universal wildcard type
ANY = AnyType("*")
# Max slots to support (prevent tuple index errors)
MAX_SLOTS = 64

class DS_PipeIn:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                # Initial input. JS will add more dynamically.
                "input_1": (ANY,)
            }
        }

    RETURN_TYPES = ("DS_PIPE",)
    RETURN_NAMES = ("pipe",)
    FUNCTION = "pack_pipe"
    CATEGORY = "☠️ Deathshot Arsenal/🔀 Routing"
    DESCRIPTION = "Universal Pipe In. Aggregates inputs. Auto-renames slots for clarity."

    def pack_pipe(self, **kwargs):
        # The JS side renames keys to: "1. +ve [KSampler]", "2. Model [Checkpoint]", etc.
        # We must sort strictly by the leading number to preserve order.
        
        def sort_key(k):
            # 1. Try to find "1. ", "2. " pattern at the start
            m = re.match(r'^(\d+)\.', k)
            if m:
                return int(m.group(1))
            
            # 2. Fallback for "input_1" style
            m = re.search(r'(\d+)$', k)
            if m:
                return int(m.group(1))
                
            # 3. Last resort
            return 9999

        sorted_keys = sorted(kwargs.keys(), key=sort_key)
        
        pipe_payload = []
        for k in sorted_keys:
            pipe_payload.append(kwargs[k])
            
        return (pipe_payload,)

class DS_PipeOut:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pipe": ("DS_PIPE",)
            }
        }

    # EXPANDED RETURN TYPES to prevent "tuple index out of range"
    # We declare 64 outputs. The JS hides the unused ones, but Python must support them.
    RETURN_TYPES = (ANY,) * MAX_SLOTS
    FUNCTION = "unpack_pipe"
    CATEGORY = "☠️ Deathshot Arsenal/🔀 Routing"
    DESCRIPTION = "Universal Pipe Out. Auto-syncs with connected Pipe In."

    def unpack_pipe(self, pipe):
        if not pipe:
            # Return full None tuple if empty
            return (None,) * MAX_SLOTS
        
        # Convert to list to modify
        output_list = list(pipe)
        
        # Pad with None up to MAX_SLOTS to satisfy ComfyUI's return requirement
        if len(output_list) < MAX_SLOTS:
            output_list.extend([None] * (MAX_SLOTS - len(output_list)))
            
        # If we have too many (rare), truncate
        if len(output_list) > MAX_SLOTS:
            output_list = output_list[:MAX_SLOTS]
            
        return tuple(output_list)
