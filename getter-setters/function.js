export async const handle = (state, action) => {
    const fn = action.input.fn;
    if(fn === "SET_ADMIN_NAME") {
        state.adminName = action.input.newAdminName;
        return { state };
    } else if(fn === "GET_ADMIN_NAME") {
        return {
            result: state.adminName
        }
    }
}